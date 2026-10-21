import {IsString, Matches} from "class-validator";
import {SSO_PKCE_CHALLENGE_PATTERN} from "../../sso.constants";

export class SsoStartQueryDto {
    @IsString()
    @Matches(SSO_PKCE_CHALLENGE_PATTERN)
    challenge: string;
}
