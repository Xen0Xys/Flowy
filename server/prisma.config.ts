// oxlint-disable-next-line import/no-unassigned-import
import "dotenv/config";
import {defineConfig, env} from "prisma/config";

// oxlint-disable-next-line import/no-default-export
export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
        seed: "bun prisma/seed",
    },
    datasource: {
        url: env("DATABASE_URL"),
    },
});
