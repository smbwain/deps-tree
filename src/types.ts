
export enum State {
    off,
    initializing,
    up,
    deinitializing,
    down,
    error
}

export type SyncOrAsync<T> = T | Promise<T>;

export interface ModuleDescription {
    deps?: string[];
    init: (deps: {[name: string]: any}) => SyncOrAsync<any | void>;
    deinit?: () => SyncOrAsync<void>;
//    cancel?,
    data?: any;
    needed?: boolean;
}