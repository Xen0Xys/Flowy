import {BadRequestException, ValidationError, ValidationPipe} from "@nestjs/common";

export class CustomValidationPipe extends ValidationPipe {
    constructor() {
        super({
            transform: true,
            // Strip unknown fields before they reach the service layer.
            // Combined with forbidNonWhitelisted, unknown fields surface as a
            // 400 so accidental payload drift is caught in dev, not in prod.
            whitelist: true,
            forbidNonWhitelisted: true,
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
