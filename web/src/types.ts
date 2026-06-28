export type Clip = {
    id: number;
    content: string;
    pinned: boolean;
    tags?: string;
    createdAt: string;
};
export type Settings = {
    recording: boolean;
};