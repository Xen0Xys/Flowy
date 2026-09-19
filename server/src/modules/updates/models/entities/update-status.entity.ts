export class LatestReleaseEntity {
    tagName: string;
    name: string;
    htmlUrl: string;
    publishedAt: string;

    constructor(partial: Partial<LatestReleaseEntity>) {
        Object.assign(this, partial);
    }
}

export class UpdateStatusEntity {
    updateAvailable: boolean;
    currentVersion: string;
    latest: LatestReleaseEntity | null;
    checkedAt: string | null;

    constructor(partial: Partial<UpdateStatusEntity>) {
        Object.assign(this, partial);
    }
}
