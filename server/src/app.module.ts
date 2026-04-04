import {TransactionModule} from "./modules/accounting/transaction/transaction.module";
import {ReferenceModule} from "./modules/accounting/reference/reference.module";
import {TransferModule} from "./modules/accounting/transfer/transfer.module";
import {AccountModule} from "./modules/accounting/account/account.module";
import {BudgetModule} from "./modules/accounting/budget/budget.module";
import {ClassSerializerInterceptor, Module} from "@nestjs/common";
import {FamilyModule} from "./modules/users/family/family.module";
import {UserModule} from "./modules/users/user/user.module";
import {ConfigModule, ConfigService} from "@nestjs/config";
import HelperModule from "./modules/helper/helper.module";
import {AdminModule} from "./modules/admin/admin.module";
import {APP_GUARD, APP_INTERCEPTOR} from "@nestjs/core";
import {AuthModule} from "./modules/auth/auth.module";
import {CsrfGuard} from "./common/guards/csrf.guard";
import {ThrottlerModule} from "@nestjs/throttler";
import {ScheduleModule} from "@nestjs/schedule";
import {AppController} from "./app.controller";
import {JwtModule} from "@nestjs/jwt";
import Joi from "joi";

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validationSchema: Joi.object({
                APP_SECRET: Joi.string().required(),
                APP_NAME: Joi.string().required(),
                DATABASE_URL: Joi.string().uri().required(),
                NODE_ENV: Joi.string().valid("development", "production", "test").default("production"),
            }),
        }),
        JwtModule.registerAsync({
            global: true,
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                secret: configService.get<string>("APP_SECRET"),
                signOptions: {
                    expiresIn: "30d",
                    algorithm: "HS512",
                    issuer: configService.get<string>("APP_NAME"),
                },
                verifyOptions: {
                    algorithms: ["HS512"],
                    issuer: configService.get<string>("APP_NAME"),
                },
            }),
        }),
        ScheduleModule.forRoot(),
        ThrottlerModule.forRoot([
            {
                ttl: 60000,
                limit: 60,
            },
        ]),
        HelperModule,
        UserModule,
        AuthModule,
        AdminModule,
        FamilyModule,
        AccountModule,
        TransactionModule,
        TransferModule,
        ReferenceModule,
        BudgetModule,
    ],
    controllers: [AppController],
    providers: [
        {
            provide: APP_GUARD,
            useClass: CsrfGuard,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: ClassSerializerInterceptor,
        },
    ],
})
export class AppModule {}
