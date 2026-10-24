import {IsString, Matches} from "class-validator";
import {SSO_PKCE_VERIFIER_PATTERN, SSO_TICKET_PATTERN} from "../../sso.constants";

export class SsoExchangeDto {
    @IsString()
    @Matches(SSO_TICKET_PATTERN)
    ticket: string;

    @IsString()
    @Matches(SSO_PKCE_VERIFIER_PATTERN)
    verifier: string;
}
