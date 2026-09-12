import {
    ArgumentsHost,
    BadRequestException,
    Catch,
    ConflictException,
    ExceptionFilter,
    HttpException,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import {BaseExceptionFilter} from "@nestjs/core";
import {Prisma} from "../../../prisma/generated/client";

// Maps Prisma known errors to Nest HTTP exceptions so services do not need
// per-call catch blocks and controllers return semantic status codes instead
// of an opaque 500.
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(PrismaExceptionFilter.name);

    catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
        const mapped = this.mapToHttpException(exception);
        if (mapped) {
            // oxlint-disable-next-line promise/valid-params
            super.catch(mapped, host);
            return;
        }
        this.logger.error(`Unmapped Prisma error ${exception.code}: ${exception.message}`);
        // oxlint-disable-next-line promise/valid-params
        super.catch(exception, host);
    }

    private mapToHttpException(exception: Prisma.PrismaClientKnownRequestError): HttpException | null {
        switch (exception.code) {
            case "P2002":
                return new ConflictException("A resource with the same unique value already exists");
            case "P2003":
                return new BadRequestException("Related record is missing or violates a foreign key constraint");
            case "P2025":
                return new NotFoundException("Record not found");
            default:
                return null;
        }
    }
}
