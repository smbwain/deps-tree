import {EventEmitter} from 'events';
import * as defer from 'defer-promise';
import {State, SyncOrAsync, ModuleDescription} from "./types";

export * from './types';

export class DepsTree extends EventEmitter {
    private state : State = State.off;
    private _modulesToUnload : number = 0;
    private errors = [];
    private modules : {
        [name: string]: {
            dependencies: string[],
            dependenciesToLoad: number,
            dependants: string[],
            state: State,
            dependantsToUnload: number,
            needed: boolean,
            data?: any,
            init: (deps: {[name: string]: any}) => SyncOrAsync<any>,
            deinit: () => SyncOrAsync<void>,
            error?: any
        }
    } = {};
    private _modulesToLoad : number;
    private _initDefer;
    private _deinitDefer;

    constructor(modules : {[name: string]: ModuleDescription}) {
        super();
        for (const name in modules) {
            const module = modules[name];
            const dependencies = modules[name].deps || [];
            this.modules[name] = {
                // ...modules[name],
                dependencies,
                dependenciesToLoad: dependencies.length,
                dependants: [],
                state: State.off,
                dependantsToUnload: 0,
                needed: !!module.needed,
                init: module.init,
                data: module.data,
                deinit: module.deinit || (() => {})
            }
        }
        for (const moduleName in this.modules) {
            for (const depName of this.modules[moduleName].dependencies) {
                const dependency = this.modules[depName];
                if (!dependency) {
                    throw new Error(`Broken dependency "${depName}"`);
                }
                dependency.dependants.push(moduleName);
            }
        }
        const fillNeeded = module => {
            module.needed = true;
            for(const dependencyName of module.dependencies) {
                const dependency = this.modules[dependencyName];
                if(!dependency.needed) {
                    fillNeeded(dependency);
                }
            }
        };
        for (const moduleName in this.modules) {
            if(this.modules[moduleName].needed) {
                fillNeeded(this.modules[moduleName]);
            }
        }
    }

    private _changeModuleState(name : string, state : State) : void {
        this.modules[name].state = state;
        this.emit('module-state', name, state);
    }

    private _changeState(state : State) : void {
        this.state = state;
        this.emit('state', state);
    }

    private _initModule(name : string) : void{
        const module = this.modules[name];
        this._changeModuleState(name, State.initializing);
        this._modulesToUnload++;
        (async() => {
            try {
                try {
                    const dependenciesObject = {};
                    for (const dependencyName of module.dependencies) {
                        dependenciesObject[dependencyName] = this.modules[dependencyName].data;
                    }
                    const data = await module.init(dependenciesObject);
                    module.data = module.data || data;
                } catch (err) {
                    this._modulesToUnload--;
                    this._changeModuleState(name, State.error);
                    module.error = err;
                    this._error(err, name);
                    return;
                }
                this._moduleInited(name);
            } catch(err) {
                console.error(err.stack);
            }
        })();
    }

    private _moduleInited(name : string) : void {
        switch (this.state) {
            case State.initializing:
                const module = this.modules[name];
                this._changeModuleState(name, State.up);
                for(const dependencyName of module.dependencies) {
                    this.modules[dependencyName].dependantsToUnload++;
                }
                if (--this._modulesToLoad == 0) {
                    this._initDefer.resolve();
                    this._changeState(State.up);
                    this.emit('started');
                    return;
                }
                for (const depentantName of module.dependants) {
                    if (--this.modules[depentantName].dependenciesToLoad == 0) {
                        this._initModule(depentantName);
                    }
                }
                break;
            case State.deinitializing:
                this._deinitModule(name);
                break;
            default:
                throw new Error('State error');
        }
    }

    private _deinitModule(name : string) : void {
        const module = this.modules[name];

        (async() => {
            try {
                this._changeModuleState(name, State.deinitializing);
                try {
                    await module.deinit();
                    this._changeModuleState(name, State.down);
                } catch (err) {
                    this._changeModuleState(name, State.error);
                    module.error = err;
                    this._error(err, name);
                }
                if (--this._modulesToUnload <= 0) {
                    this._deinitDefer.resolve();
                    this._changeState(State.down);
                    this.emit('stopped');
                    return;
                }
                for (const dependencyName of module.dependencies) {
                    if (--this.modules[dependencyName].dependantsToUnload <= 0) {
                        this._deinitModule(dependencyName);
                    }
                }
            } catch (err) {
                console.error(err.stack);
            }
        })();
    }

    private _error(err : Error, name? : string) : void {
        try {
            if(this.listenerCount('error')) {
                this.emit('error', err, name || '')
            } else {
                console.error(err.stack);
            }
            this.errors.push(err);
            this.deinit();
        } catch (err) {
            console.error(err.stack || err);
        }
    }

    /**
     * Run this method to init all needed modules and their dependencies
     * If you run this method on initializing tree, you'd get the same promise, as for first call
     * If you run it on initialized and working tree, init would be resolved immediately
     * If the state of tree is deinitializing, down or error, it rejects error
     */
    init() {
        switch (this.state) {
            case State.off:
                this._changeState(State.initializing);
                this._initDefer = defer();
                this._modulesToLoad = 0;
                Promise.resolve().then(() => {
                    for (const name in this.modules) {
                        const module = this.modules[name];
                        if (module.needed) {
                            this._modulesToLoad++;
                            if (!module.dependenciesToLoad) {
                                this._initModule(name);
                            }
                        }
                    }
                }).catch(err => {
                    this._error(err);
                });
            /* falls through */
            case State.initializing:
                return this._initDefer.promise;
            case State.up:
                return Promise.resolve();
            default:
                throw new Error('I can\'t init tree');
        }
    }

    deinit() {
        switch (this.state) {
            case State.off:
                this._changeState(State.down);
            /* falls through */
            case State.error:
            /* falls through */
            case State.down:
                return Promise.resolve();
            case State.initializing:
            case State.up:
                this._changeState(State.deinitializing);
                this._deinitDefer = defer();
                for(const moduleName in this.modules) {
                    const module = this.modules[moduleName];
                    if(module.state == State.up && !module.dependantsToUnload) {
                        this._deinitModule(moduleName);
                    }
                }
            /* falls through */
            case State.deinitializing:
                return this._deinitDefer.promise;
        }
    }
}