import {IsDateString} from "class-validator";

export class GetAccountBalanceEvolutionDto {
    @IsDateString()
    startDate: string;

    @IsDateString()
    endDate: string;
}
