import {Injectable, Logger} from "@nestjs/common";

@Injectable()
export class WebAuthnConfigService {
    private readonly logger = new Logger(WebAuthnConfigService.name);
    private readonly _rpID: string;
    private readonly _rpName: string;
    private readonly _origins: string[];

    constructor() {
        const rawOrigins = (process.env.WEBAUTHN_ORIGINS ?? process.env.CORS_ORIGINS ?? "http://localhost:3000")
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean);
        if (rawOrigins.length === 0) {
            throw new Error("WEBAUTHN_ORIGINS (or CORS_ORIGINS) must contain at least one origin for WebAuthn");
        }
        this._origins = rawOrigins;

        const explicitRpID = process.env.WEBAUTHN_RP_ID?.trim();
        if (explicitRpID) {
            this._rpID = explicitRpID;
        } else {
            if (process.env.NODE_ENV === "production") {
                throw new Error(
                    "WEBAUTHN_RP_ID must be set explicitly in production; changing it invalidates every existing passkey",
                );
            }
            try {
                this._rpID = new URL(rawOrigins[0]!).hostname;
            } catch {
                throw new Error(`Unable to derive WEBAUTHN_RP_ID from origin: ${rawOrigins[0]}`);
            }
        }

        this._rpName = process.env.WEBAUTHN_RP_NAME?.trim() || process.env.APP_NAME || "Flowy";
        this.logger.log(`WebAuthn RP configured id=${this._rpID} origins=${this._origins.join(",")}`);
    }

    get rpID(): string {
        return this._rpID;
    }

    get rpName(): string {
        return this._rpName;
    }

    get origins(): string[] {
        return this._origins;
    }
}
