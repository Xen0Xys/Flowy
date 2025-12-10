import {
    BadRequestException,
    ValidationError,
    ValidationPipe,
} from "@nestjs/common";

export class CustomValidationPipe extends ValidationPipe {
    constructor() {
        super({
            transform: true,
            transformOptions: {enableImplicitConversion: true},
        });
    }

    createExceptionFactory() {
        return (validationErrors: ValidationError[] = []) => {
            if (this.isDetailedOutputDisabled) {
                return new BadRequestException();
            }
            const messages = validationErrors.map((error) => ({
                property: error.property,
                constraints: error.constraints,
            }));
            // this.logger.error(messages);
            return new BadRequestException(messages);
        };
    }
}
