
import EventEmitter = NodeJS.EventEmitter;

import {ModuleDescription, State} from './src/types';

export * from './src/types';

export class DepsTree extends EventEmitter {
    constructor(modules : {[name: string]: ModuleDescription});
    init(): Promise<void>;
    deinit(): Promise<void>;
}