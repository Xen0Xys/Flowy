import {PrismaService} from "../../helper/prisma.service";
import {Injectable} from "@nestjs/common";

@Injectable()
export class TransferService {
    constructor(private readonly prismaService: PrismaService) {}
}
