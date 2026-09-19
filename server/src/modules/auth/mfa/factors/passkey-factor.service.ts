import {BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException} from "@nestjs/common";
import {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
    AuthenticationResponseJSON,
    AuthenticatorTransportFuture,
    PublicKeyCredentialCreationOptionsJSON,
    PublicKeyCredentialRequestOptionsJSON,
    RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {PrismaService} from "../../../helper/prisma.service";
import {WebAuthnConfigService} from "../../../helper/webauthn-config.service";
import type {MfaFactor, MfaMethod} from "../mfa-factor.interface";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CHALLENGE_PURPOSE_REGISTER = "registration";
const CHALLENGE_PURPOSE_AUTH = "authentication";
const CHALLENGE_PURPOSE_SETTINGS = "settings-verify";

const ALLOWED_TRANSPORTS: readonly AuthenticatorTransportFuture[] = [
    "usb",
    "nfc",
    "ble",
    "internal",
    "hybrid",
    "smart-card",
    "cable",
];

function toTransports(values: string[]): AuthenticatorTransportFuture[] {
    return values.filter((v): v is AuthenticatorTransportFuture =>
        (ALLOWED_TRANSPORTS as readonly string[]).includes(v),
    );
}

function encodeUserHandle(userId: string): Buffer {
    // Encode the UUID as its raw 16 bytes rather than the ASCII string; keeps the
    // credential storage compact and hides the DB key format from authenticators.
    return Buffer.from(userId.replace(/-/g, ""), "hex");
}

export interface PasskeySummary {
    id: string;
    label: string;
    transports: string[];
    createdAt: Date;
    lastUsedAt: Date | null;
}

@Injectable()
export class PasskeyFactorService implements MfaFactor {
    readonly method: MfaMethod = "passkey";
    private readonly logger = new Logger(PasskeyFactorService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: WebAuthnConfigService,
    ) {}

    async isEnrolledFor(userId: string): Promise<boolean> {
        const count = await this.prisma.userPasskeys.count({where: {user_id: userId}});
        return count > 0;
    }

    async listForUser(userId: string): Promise<PasskeySummary[]> {
        const rows = await this.prisma.userPasskeys.findMany({
            where: {user_id: userId},
            orderBy: {created_at: "desc"},
        });
        return rows.map((row) => ({
            id: row.id,
            label: row.label,
            transports: row.transports,
            createdAt: row.created_at,
            lastUsedAt: row.last_used_at,
        }));
    }

    async generateRegistrationOptions(
        userId: string,
        username: string,
        displayName: string,
    ): Promise<PublicKeyCredentialCreationOptionsJSON> {
        const existing = await this.prisma.userPasskeys.findMany({
            where: {user_id: userId},
            select: {credential_id: true, transports: true},
        });

        const options = await generateRegistrationOptions({
            rpName: this.config.rpName,
            rpID: this.config.rpID,
            userName: username,
            userDisplayName: displayName,
            userID: encodeUserHandle(userId),
            attestationType: "none",
            authenticatorSelection: {
                residentKey: "required",
                userVerification: "required",
                requireResidentKey: true,
            },
            excludeCredentials: existing.map((p) => ({
                id: p.credential_id,
                transports: toTransports(p.transports),
            })),
        });

        await this.storeChallenge(userId, CHALLENGE_PURPOSE_REGISTER, options.challenge);
        return options;
    }

    async verifyRegistration(
        userId: string,
        response: RegistrationResponseJSON,
        label: string,
    ): Promise<PasskeySummary> {
        const trimmedLabel = label.trim();
        if (trimmedLabel.length === 0 || trimmedLabel.length > 50) {
            throw new BadRequestException("Label must be between 1 and 50 characters");
        }

        const challenge = await this.consumeChallenge(userId, CHALLENGE_PURPOSE_REGISTER);

        let verification;
        try {
            verification = await verifyRegistrationResponse({
                response,
                expectedChallenge: challenge,
                expectedOrigin: this.config.origins,
                expectedRPID: this.config.rpID,
                requireUserVerification: true,
            });
        } catch (err) {
            this.logger.warn(`Passkey registration verification failed user=${userId} err=${(err as Error).message}`);
            throw new UnauthorizedException("Passkey registration failed");
        }

        if (!verification.verified || !verification.registrationInfo) {
            throw new UnauthorizedException("Passkey registration failed");
        }

        const {credential, credentialDeviceType, credentialBackedUp} = verification.registrationInfo;
        const transports = toTransports(credential.transports ?? []);

        const created = await this.prisma.userPasskeys.create({
            data: {
                user_id: userId,
                credential_id: credential.id,
                public_key: Buffer.from(credential.publicKey),
                counter: BigInt(credential.counter),
                transports,
                device_type: credentialDeviceType,
                backed_up: credentialBackedUp,
                label: trimmedLabel,
            },
        });

        this.logger.log(`Passkey registered user=${userId} passkey=${created.id}`);
        return {
            id: created.id,
            label: created.label,
            transports: created.transports,
            createdAt: created.created_at,
            lastUsedAt: created.last_used_at,
        };
    }

    async generateAuthenticationOptions(userId: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
        return this.buildAuthenticationOptions(userId, CHALLENGE_PURPOSE_AUTH);
    }

    async generateSettingsAuthOptions(userId: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
        return this.buildAuthenticationOptions(userId, CHALLENGE_PURPOSE_SETTINGS);
    }

    async verifyAuthentication(userId: string, response: AuthenticationResponseJSON): Promise<boolean> {
        return this.verifyAssertionWithPurpose(userId, response, CHALLENGE_PURPOSE_AUTH);
    }

    async verifySettingsAuthentication(userId: string, response: AuthenticationResponseJSON): Promise<boolean> {
        return this.verifyAssertionWithPurpose(userId, response, CHALLENGE_PURPOSE_SETTINGS);
    }

    private async buildAuthenticationOptions(
        userId: string,
        purpose: string,
    ): Promise<PublicKeyCredentialRequestOptionsJSON> {
        const passkeys = await this.prisma.userPasskeys.findMany({
            where: {user_id: userId},
            select: {credential_id: true, transports: true},
        });
        if (passkeys.length === 0) {
            throw new BadRequestException("No passkey registered for this user");
        }

        const options = await generateAuthenticationOptions({
            rpID: this.config.rpID,
            userVerification: "required",
            allowCredentials: passkeys.map((p) => ({
                id: p.credential_id,
                transports: toTransports(p.transports),
            })),
        });

        await this.storeChallenge(userId, purpose, options.challenge);
        return options;
    }

    private async verifyAssertionWithPurpose(
        userId: string,
        response: AuthenticationResponseJSON,
        purpose: string,
    ): Promise<boolean> {
        const challenge = await this.consumeChallenge(userId, purpose);

        const passkey = await this.prisma.userPasskeys.findUnique({where: {credential_id: response.id}});
        if (!passkey || passkey.user_id !== userId) {
            throw new UnauthorizedException("Unknown passkey");
        }

        let verification;
        try {
            verification = await verifyAuthenticationResponse({
                response,
                expectedChallenge: challenge,
                expectedOrigin: this.config.origins,
                expectedRPID: this.config.rpID,
                requireUserVerification: true,
                credential: {
                    id: passkey.credential_id,
                    publicKey: new Uint8Array(passkey.public_key),
                    counter: Number(passkey.counter),
                    transports: toTransports(passkey.transports),
                },
            });
        } catch (err) {
            this.logger.warn(`Passkey authentication verification failed user=${userId} err=${(err as Error).message}`);
            return false;
        }

        if (!verification.verified) return false;

        const {newCounter} = verification.authenticationInfo;
        // Reject counter regression to defeat cloned authenticator replay. Some
        // passkeys (iCloud) always report 0; only enforce strict increase when
        // the authenticator itself increments.
        if (Number(passkey.counter) > 0 && newCounter <= Number(passkey.counter)) {
            this.logger.warn(`Passkey counter regression detected user=${userId} passkey=${passkey.id}`);
            return false;
        }

        await this.prisma.userPasskeys.update({
            where: {id: passkey.id},
            data: {
                counter: BigInt(newCounter),
                last_used_at: new Date(),
                backed_up: verification.authenticationInfo.credentialBackedUp,
            },
        });
        return true;
    }

    async rename(userId: string, passkeyId: string, label: string): Promise<PasskeySummary> {
        const trimmedLabel = label.trim();
        if (trimmedLabel.length === 0 || trimmedLabel.length > 50) {
            throw new BadRequestException("Label must be between 1 and 50 characters");
        }
        const existing = await this.prisma.userPasskeys.findUnique({where: {id: passkeyId}});
        if (!existing || existing.user_id !== userId) throw new NotFoundException("Passkey not found");

        const updated = await this.prisma.userPasskeys.update({
            where: {id: passkeyId},
            data: {label: trimmedLabel},
        });
        return {
            id: updated.id,
            label: updated.label,
            transports: updated.transports,
            createdAt: updated.created_at,
            lastUsedAt: updated.last_used_at,
        };
    }

    async delete(userId: string, passkeyId: string): Promise<void> {
        const existing = await this.prisma.userPasskeys.findUnique({where: {id: passkeyId}});
        if (!existing || existing.user_id !== userId) throw new NotFoundException("Passkey not found");
        await this.prisma.userPasskeys.delete({where: {id: passkeyId}});
        this.logger.log(`Passkey deleted user=${userId} passkey=${passkeyId}`);
    }

    async countForUser(userId: string): Promise<number> {
        return this.prisma.userPasskeys.count({where: {user_id: userId}});
    }

    async purge(userId: string): Promise<void> {
        await this.prisma.userPasskeys.deleteMany({where: {user_id: userId}});
        await this.prisma.webAuthnChallenges.deleteMany({where: {user_id: userId}});
    }

    private async storeChallenge(userId: string, purpose: string, challenge: string): Promise<void> {
        await this.prisma.webAuthnChallenges.upsert({
            where: {user_id_purpose: {user_id: userId, purpose}},
            create: {
                user_id: userId,
                challenge,
                purpose,
                expires_at: new Date(Date.now() + CHALLENGE_TTL_MS),
            },
            update: {
                challenge,
                expires_at: new Date(Date.now() + CHALLENGE_TTL_MS),
                created_at: new Date(),
            },
        });
    }

    private async consumeChallenge(userId: string, purpose: string): Promise<string> {
        let row;
        try {
            row = await this.prisma.webAuthnChallenges.delete({
                where: {user_id_purpose: {user_id: userId, purpose}},
            });
        } catch {
            throw new UnauthorizedException("No pending WebAuthn challenge");
        }
        if (row.expires_at.getTime() < Date.now()) {
            throw new UnauthorizedException("WebAuthn challenge expired");
        }
        return row.challenge;
    }
}
