// @ts-ignore
import {describe, expect, test} from "bun:test";
import {serializeCookie} from "@nestjs/core/helpers/cookies/serialize-cookie.js";
import {SSO_MFA_COOKIE, SSO_TOKEN_COOKIE} from "../src/modules/auth/sso/sso.constants";

describe("SSO cookie names", () => {
    test.each([SSO_TOKEN_COOKIE, SSO_MFA_COOKIE])("%s is accepted by Nest's cookie serializer", (name: string) => {
        expect(() => serializeCookie(name, "value", {path: "/", sameSite: "lax"})).not.toThrow();
    });
});
