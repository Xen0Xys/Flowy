import {ClassSerializerInterceptor, Module} from "@nestjs/common";
import {FamilyModule} from "./modules/users/family/family.module";
import {ConfigModule, ConfigService} from "@nestjs/config";
import HelperModule from "./modules/helper/helper.module";
import {AdminModule} from "./modules/admin/admin.module";
import {UserModule} from "./modules/users/user/user.module";
import {ThrottlerModule} from "@nestjs/throttler";
import {ScheduleModule} from "@nestjs/schedule";
import {AppController} from "./app.controller";
import {APP_INTERCEPTOR} from "@nestjs/core";
import {JwtModule} from "@nestjs/jwt";
import {AccountModule} from "./modules/accounting/account/account.module";
import {TransactionModule} from "./modules/accounting/transaction/transaction.module";
import {ReferenceModule} from "./modules/accounting/reference/reference.module";

@Module({
    imports: [
        ConfigModule.forRoot({isGlobal: true}),
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
        AdminModule,
        FamilyModule,
        AccountModule,
        TransactionModule,
        ReferenceModule,
    ],
    controllers: [AppController],
    providers: [
        {
            provide: APP_INTERCEPTOR,
            useClass: ClassSerializerInterceptor,
        },
    ],
})
export class AppModule {}
