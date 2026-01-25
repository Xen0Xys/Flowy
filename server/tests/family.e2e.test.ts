import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";
import {config as loadEnv} from "dotenv";
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    test,
} from "bun:test";
import {FastifyAdapter, NestFastifyApplication} from "@nestjs/platform-fastify";
import {ConfigKey, PrismaClient, UserRoles} from "../prisma/generated/client";
import {CustomValidationPipe} from "../src/common/pipes/validation.pipe";
import {AppModule} from "../src/app.module";
import {PrismaPg} from "@prisma/adapter-pg";
import {Test} from "@nestjs/testing";
import {Server} from "node:http";
import crypto from "node:crypto";
import request from "supertest";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
    loadEnv({path: envPath});
}

let app: NestFastifyApplication;
let server: Server;
let prisma: PrismaClient;

describe("FamilyController (e2e)", () => {
    beforeAll(async () => {
        prisma = new PrismaClient({
            adapter: new PrismaPg({
                connectionString: process.env.DATABASE_URL,
            }),
        });
        await prisma.$connect();
        await ensureInstanceConfig(prisma);

        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleRef.createNestApplication<NestFastifyApplication>(
            new FastifyAdapter({exposeHeadRoutes: true}),
        );
        app.useGlobalPipes(new CustomValidationPipe());
        await app.init();
        const instance = app.getHttpAdapter().getInstance();
        await instance.ready();
        server = instance.server;
    });

    beforeEach(async () => {
        await prisma.familyInvites.deleteMany();
        await prisma.userSettings.deleteMany();
        await prisma.users.deleteMany();
        await prisma.family.deleteMany();
        await prisma.config.update({
            where: {key: ConfigKey.REGISTRATION_ENABLED},
            data: {value: "true"},
        });
    });

    afterAll(async () => {
        if (app) {
            await app.close();
        }
        await prisma?.$disconnect();
    });

    /**
     * CREATE
     */
    test("requires authentication to create a family", async () => {
        const response = await request(server)
            .post("/family/create")
            .send({name: "Ghost", currency: "USD"});

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Authorization token is missing");
    });

    test("creates a family and promotes creator to admin", async () => {
        const admin = await registerUser();
        const familyResponse = await request(server)
            .post("/family/create")
            .set("Authorization", `Bearer ${admin.token}`)
            .send({name: "The Crew", currency: "EUR"});

        expect(familyResponse.status).toBe(201);
        expect(familyResponse.body.name).toBe("The Crew");
        expect(familyResponse.body.currency).toBe("EUR");
        expect(familyResponse.body.owner.email).toBe(admin.user.email);

        const storedAdmin = await prisma.users.findUnique({
            where: {email: admin.user.email},
        });
        expect(storedAdmin?.family_id).toEqual(expect.any(String));
        expect(storedAdmin?.family_role).toBe(UserRoles.ADMIN);
    });

    test("rejects family creation when user already belongs to one", async () => {
        const admin = await registerUser();
        await createFamily(admin.token);

        const duplicate = await request(server)
            .post("/family/create")
            .set("Authorization", `Bearer ${admin.token}`)
            .send({name: "Another", currency: "USD"});

        expect(duplicate.status).toBe(409);
        expect(duplicate.body.message).toBe("User is already in a family");
    });

    /**
     * INVITES
     */
    test("allows admins to invite members and list pending invites", async () => {
        const admin = await registerUser();
        await createFamily(admin.token);
        const inviteEmail = `member-${crypto.randomUUID()}@e2e.test`;

        const inviteResponse = await request(server)
            .post("/family/invite")
            .set("Authorization", `Bearer ${admin.token}`)
            .send({email: inviteEmail});

        expect(inviteResponse.status).toBe(201);
        expect(inviteResponse.body.code).toEqual(expect.any(String));

        const listResponse = await request(server)
            .get("/family/invites")
            .set("Authorization", `Bearer ${admin.token}`);

        expect(listResponse.status).toBe(200);
        expect(listResponse.body).toEqual([
            expect.objectContaining({
                code: inviteResponse.body.code,
                email: inviteEmail,
            }),
        ]);
    });

    test("admin can invite and member can accept invite", async () => {
        const admin = await registerUser();
        const family = await createFamily(admin.token);
        const member = await registerUser();

        const inviteResponse = await request(server)
            .post("/family/invite")
            .set("Authorization", `Bearer ${admin.token}`)
            .send({email: member.user.email});
        expect(inviteResponse.status).toBe(201);

        const joinResponse = await request(server)
            .post(`/family/join/${inviteResponse.body.code}`)
            .set("Authorization", `Bearer ${member.token}`);
        expect(joinResponse.status).toBe(204);

        const memberRecord = await prisma.users.findUnique({
            where: {email: member.user.email},
        });
        expect(memberRecord?.family_id).toBe(family.id);
        expect(memberRecord?.family_role).toBe(UserRoles.USER);
    });

    test("non-admin member cannot invite others", async () => {
        const admin = await registerUser();
        await createFamily(admin.token);
        const member = await registerUser();

        // admin invites and member joins
        const inviteResponse = await request(server)
            .post("/family/invite")
            .set("Authorization", `Bearer ${admin.token}`)
            .send({email: member.user.email});
        expect(inviteResponse.status).toBe(201);

        const joinResponse = await request(server)
            .post(`/family/join/${inviteResponse.body.code}`)
            .set("Authorization", `Bearer ${member.token}`);
        expect(joinResponse.status).toBe(204);

        // now the member (non-admin) attempts to invite
        const forbiddenInvite = await request(server)
            .post("/family/invite")
            .set("Authorization", `Bearer ${member.token}`)
            .send({email: `other-${crypto.randomUUID()}@e2e.test`});

        expect(forbiddenInvite.status).toBe(403);
        expect(forbiddenInvite.body.message).toBe(
            "User must be a family admin",
        );
    });

    test("allows admins to revoke invites", async () => {
        const admin = await registerUser();
        await createFamily(admin.token);
        const inviteResponse = await request(server)
            .post("/family/invite")
            .set("Authorization", `Bearer ${admin.token}`)
            .send({email: `temp-${crypto.randomUUID()}@e2e.test`});
        const code = inviteResponse.body.code;

        const revokeResponse = await request(server)
            .delete(`/family/invites/${code}`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(revokeResponse.status).toBe(204);

        const invites = await prisma.familyInvites.findMany();
        expect(invites).toHaveLength(0);
    });

    test("rejects invite listing when user is not admin", async () => {
        const admin = await registerUser();
        await createFamily(admin.token);
        const member = await registerUser();

        const inviteResponse = await request(server)
            .post("/family/invite")
            .set("Authorization", `Bearer ${admin.token}`)
            .send({email: member.user.email});
        expect(inviteResponse.status).toBe(201);

        const listResponse = await request(server)
            .get("/family/invites")
            .set("Authorization", `Bearer ${member.token}`);

        expect(listResponse.status).toBe(403);
        expect(listResponse.body.message).toBe(
            "User is not associated with a family",
        );
    });

    /**
     * JOIN
     */
    test("rejects joining without authentication", async () => {
        const response = await request(server).post("/family/join/any-code");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Authorization token is missing");
    });

    test("allows invited users to join and removes the invite", async () => {
        const admin = await registerUser();
        const family = await createFamily(admin.token);
        const member = await registerUser();

        const inviteResponse = await request(server)
            .post("/family/invite")
            .set("Authorization", `Bearer ${admin.token}`)
            .send({email: member.user.email});
        const code = inviteResponse.body.code;

        const joinResponse = await request(server)
            .post(`/family/join/${code}`)
            .set("Authorization", `Bearer ${member.token}`);

        expect(joinResponse.status).toBe(204);

        const refreshedMember = await prisma.users.findUnique({
            where: {email: member.user.email},
        });
        expect(refreshedMember?.family_id).toBe(family.id);
        expect(refreshedMember?.family_role).toBe(UserRoles.USER);

        const invite = await prisma.familyInvites.findUnique({
            where: {code},
        });
        expect(invite).toBeNull();
    });

    test("rejects joining when invite email does not match user", async () => {
        const admin = await registerUser();
        await createFamily(admin.token);
        const inviteEmail = `expected-${crypto.randomUUID()}@e2e.test`;

        const inviteResponse = await request(server)
            .post("/family/invite")
            .set("Authorization", `Bearer ${admin.token}`)
            .send({email: inviteEmail});

        const outsider = await registerUser();
        const joinResponse = await request(server)
            .post(`/family/join/${inviteResponse.body.code}`)
            .set("Authorization", `Bearer ${outsider.token}`);

        expect(joinResponse.status).toBe(401);
        expect(joinResponse.body.message).toBe(
            "Invite code is not for this user",
        );
    });

    test("rejects joining when invite code does not exist", async () => {
        const user = await registerUser();

        const response = await request(server)
            .post("/family/join/unknown-code")
            .set("Authorization", `Bearer ${user.token}`);

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Invite code does not exist");
    });

    /**
     * QUIT
     */
    test("allows members to quit and disallows quitting when not in a family", async () => {
        const admin = await registerUser();
        await createFamily(admin.token);

        const quitResponse = await request(server)
            .delete("/family/quit")
            .set("Authorization", `Bearer ${admin.token}`);
        expect(quitResponse.status).toBe(204);

        const refreshedAdmin = await prisma.users.findUnique({
            where: {email: admin.user.email},
        });
        expect(refreshedAdmin?.family_id).toBeNull();
        expect(refreshedAdmin?.family_role).toBeNull();

        const stranger = await registerUser();
        const invalidQuit = await request(server)
            .delete("/family/quit")
            .set("Authorization", `Bearer ${stranger.token}`);

        expect(invalidQuit.status).toBe(404);
        expect(invalidQuit.body.message).toBe("User is not in a family");
    });

    test("allows admin to delete a family and only admin can do it", async () => {
        const admin = await registerUser();
        const family = await createFamily(admin.token);

        // Create another member
        const member = await registerUser();
        const inviteResponse = await request(server)
            .post("/family/invite")
            .set("Authorization", `Bearer ${admin.token}`)
            .send({email: member.user.email});
        expect(inviteResponse.status).toBe(201);

        const joinResponse = await request(server)
            .post(`/family/join/${inviteResponse.body.code}`)
            .set("Authorization", `Bearer ${member.token}`);
        expect(joinResponse.status).toBe(204);

        // Non-admin cannot delete
        const forbidden = await request(server)
            .delete("/family")
            .set("Authorization", `Bearer ${member.token}`);
        expect(forbidden.status).toBe(403);

        // Admin deletes family
        const del = await request(server)
            .delete("/family")
            .set("Authorization", `Bearer ${admin.token}`);
        expect(del.status).toBe(204);

        const stored = await prisma.family.findUnique({where: {id: family.id}});
        expect(stored).toBeNull();

        const refreshedMember = await prisma.users.findUnique({
            where: {id: member.user.id},
        });
        expect(refreshedMember?.family_id).toBeNull();
        expect(refreshedMember?.family_role).toBeNull();
    });

    /**
     * GET FAMILY INFO
     */
    test("requires authentication to get family info", async () => {
        const response = await request(server).get("/family/family");

        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Authorization token is missing");
    });

    test("rejects when user is not in a family", async () => {
        const stranger = await registerUser();

        const response = await request(server)
            .get("/family/family")
            .set("Authorization", `Bearer ${stranger.token}`);

        expect(response.status).toBe(404);
        expect(response.body.message).toBe("User is not in a family");
    });

    test("returns family info for admin and members", async () => {
        const admin = await registerUser();
        const family = await createFamily(admin.token);

        // Admin can fetch family info
        const adminRes = await request(server)
            .get("/family/family")
            .set("Authorization", `Bearer ${admin.token}`);

        expect(adminRes.status).toBe(200);
        expect(adminRes.body.name).toBe(family.name);
        expect(adminRes.body.currency).toBe(family.currency);
        expect(adminRes.body.owner.email).toBe(admin.user.email);

        // Member (after joining) can also fetch family info and sees same owner
        const member = await registerUser();
        const inviteResponse = await request(server)
            .post("/family/invite")
            .set("Authorization", `Bearer ${admin.token}`)
            .send({email: member.user.email});
        expect(inviteResponse.status).toBe(201);

        const joinResponse = await request(server)
            .post(`/family/join/${inviteResponse.body.code}`)
            .set("Authorization", `Bearer ${member.token}`);
        expect(joinResponse.status).toBe(204);

        const memberRes = await request(server)
            .get("/family/family")
            .set("Authorization", `Bearer ${member.token}`);

        expect(memberRes.status).toBe(200);
        expect(memberRes.body.name).toBe(family.name);
        expect(memberRes.body.owner.email).toBe(admin.user.email);
    });

    /**
     * REMOVE MEMBER
     */
    test("allows admin to remove a non-admin member", async () => {
        const admin = await registerUser();
        const family = await createFamily(admin.token);

        // invite and join member
        const member = await registerUser();
        const inviteResponse = await request(server)
            .post("/family/invite")
            .set("Authorization", `Bearer ${admin.token}`)
            .send({email: member.user.email});
        expect(inviteResponse.status).toBe(201);

        const joinResponse = await request(server)
            .post(`/family/join/${inviteResponse.body.code}`)
            .set("Authorization", `Bearer ${member.token}`);
        expect(joinResponse.status).toBe(204);

        // admin removes member
        const removeResponse = await request(server)
            .delete(`/family/members/${member.user.id}`)
            .set("Authorization", `Bearer ${admin.token}`);
        expect(removeResponse.status).toBe(204);

        const refreshed = await prisma.users.findUnique({
            where: {id: member.user.id},
        });
        expect(refreshed?.family_id).toBeNull();
        expect(refreshed?.family_role).toBeNull();
    });

    test("rejects removing the family admin/owner", async () => {
        const admin = await registerUser();
        await createFamily(admin.token);

        const resp = await request(server)
            .delete(`/family/members/${admin.user.id}`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(resp.status).toBe(409);
        expect(resp.body.message).toBe("Cannot remove family admin/owner");
    });

    test("rejects removing a member not in your family", async () => {
        const admin = await registerUser();
        await createFamily(admin.token);

        const outsider = await registerUser();

        const resp = await request(server)
            .delete(`/family/members/${outsider.user.id}`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(resp.status).toBe(401);
        expect(resp.body.message).toBe("Member is not part of your family");
    });

    test("returns 404 when member does not exist", async () => {
        const admin = await registerUser();
        await createFamily(admin.token);

        const fakeId = crypto.randomUUID();
        const resp = await request(server)
            .delete(`/family/members/${fakeId}`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(resp.status).toBe(404);
        expect(resp.body.message).toBe("Member not found");
    });
});

interface RegisteredUser {
    token: string;
    user: {
        id: string;
        email: string;
        username: string;
    };
}

async function registerUser(
    overrides: Partial<{
        username: string;
        email: string;
        password: string;
    }> = {},
): Promise<RegisteredUser> {
    const payload = buildRegisterPayload(overrides);
    const response = await request(server).post("/user/register").send(payload);

    expect(response.status).toBe(201);
    expect(response.body.token).toEqual(expect.any(String));
    return response.body;
}

async function createFamily(
    token: string,
    overrides: Partial<{name: string; currency: string}> = {},
) {
    const payload = {
        name: overrides.name ?? `Family-${crypto.randomUUID().slice(0, 5)}`,
        currency: overrides.currency ?? "EUR",
    };

    const response = await request(server)
        .post("/family/create")
        .set("Authorization", `Bearer ${token}`)
        .send(payload);
    expect(response.status).toBe(201);

    const createdFamily = await prisma.family.findFirstOrThrow();
    return createdFamily;
}

function buildRegisterPayload(
    overrides: Partial<{
        username: string;
        email: string;
        password: string;
    }> = {},
) {
    const fallbackPassword = "SuiteP@ss1";
    const unique = crypto.randomUUID();
    return {
        username: overrides.username ?? `user-${unique.slice(0, 8)}`,
        email: overrides.email ?? `user-${unique}@e2e.test`,
        password: overrides.password ?? fallbackPassword,
    };
}

async function ensureInstanceConfig(prismaClient: PrismaClient) {
    await prismaClient.config.upsert({
        where: {key: ConfigKey.SELF_HOSTED},
        update: {value: "true"},
        create: {key: ConfigKey.SELF_HOSTED, value: "true"},
    });
    await prismaClient.config.upsert({
        where: {key: ConfigKey.REGISTRATION_ENABLED},
        update: {value: "true"},
        create: {key: ConfigKey.REGISTRATION_ENABLED, value: "true"},
    });
}
