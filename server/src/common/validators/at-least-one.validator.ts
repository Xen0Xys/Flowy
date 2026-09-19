import {registerDecorator, ValidationArguments, ValidationOptions} from "class-validator";

export function AtLeastOne(properties: string[], validationOptions?: ValidationOptions) {
    return function (target: object, propertyName: string) {
        registerDecorator({
            name: "atLeastOne",
            target: target.constructor,
            propertyName,
            constraints: [properties],
            options: {
                message: `At least one of the following properties is required: ${properties.join(", ")}`,
                ...validationOptions,
            },
            validator: {
                validate(_value: unknown, args: ValidationArguments) {
                    const [props] = args.constraints as [string[]];
                    const object = args.object as Record<string, unknown>;
                    return props.some((key) => {
                        const v = object[key];
                        if (v === undefined || v === null) return false;
                        if (typeof v === "string" && v.trim().length === 0) return false;
                        return true;
                    });
                },
            },
        });
    };
}
