export type DefaultCategory = {
    key: string;
    icon: string;
    hexColor: string;
    defaultSelected: boolean;
};

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
    {key: "food", icon: "iconoir:cart", hexColor: "#22C55E", defaultSelected: true},
    {key: "housing", icon: "iconoir:home", hexColor: "#3B82F6", defaultSelected: true},
    {key: "transport", icon: "iconoir:car", hexColor: "#F59E0B", defaultSelected: true},
    {key: "restaurants", icon: "iconoir:coffee-cup", hexColor: "#EAB308", defaultSelected: false},
    {key: "leisure", icon: "iconoir:gym", hexColor: "#EC4899", defaultSelected: false},
    {key: "health", icon: "iconoir:heart", hexColor: "#EF4444", defaultSelected: false},
    {key: "subscriptions", icon: "iconoir:refresh", hexColor: "#8B5CF6", defaultSelected: true},
    {key: "shopping", icon: "iconoir:shopping-bag", hexColor: "#F97316", defaultSelected: false},
    {key: "salary", icon: "iconoir:wallet", hexColor: "#10B981", defaultSelected: true},
    {key: "savings", icon: "iconoir:piggy-bank", hexColor: "#06B6D4", defaultSelected: false},
];
