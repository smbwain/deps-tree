
import { DepsTree, State } from '../..';

describe('tree', () => {

    const waiter = (ms) => () => new Promise<void>(resolve => {
        setTimeout(resolve, ms);
    });

    it('should work', function(done) {
        this.timeout(30000);

        const tree = new DepsTree({
            db: {
                init: waiter(4000),
                deinit: waiter(1000)
            },
            memcache: {
                init: waiter(2000),
                deinit: waiter(1000)
            },
            models: {
                deps: ['db', 'memcache'],
                init: waiter(2000),
                deinit: waiter(2000)
            },
            mq: {
                init: waiter(5000),
                deinit: waiter(3000)
            },
            webServer: {
                deps: ['models', 'mq', 'memcache'],
                init: waiter(1000),
                deinit: waiter(1000),
                needed: true
            },
            apiServer: {
                deps: ['models', 'mq'],
                init: waiter(2000),
                deinit: waiter(2000),
                needed: true
            },
        });

        const time = Date.now();
        tree.on('module-state', (moduleName, state) => {
            console.log(Date.now()-time, 'module-state>>', moduleName, State[state]);
        });
        tree.on('started', () => {
            console.log('started');
            tree.deinit();
        });
        tree.on('state', state => {
            console.log('state', State[state]);
        });
        tree.on('stopped', () => {
            done();
        });
        tree.init();
    });

    it('should fail', function(done) {
        this.timeout(30000);

        const tree = new DepsTree({
            db: {
                init: waiter(4000),
                deinit: waiter(1000)
            },
            memcache: {
                init: waiter(2000),
                deinit: waiter(1000)
            },
            models: {
                deps: ['db', 'memcache'],
                init: waiter(2000),
                deinit: waiter(2000)
            },
            mq: {
                init: waiter(5000),
                deinit: waiter(3000)
            },
            webServer: {
                deps: ['models', 'mq', 'memcache'],
                init: async (modules) => {
                    console.log(modules);
                    await waiter(500);
                    throw new Error('ops');
                },
                deinit: waiter(1000),
                needed: true
            },
            apiServer: {
                deps: ['models', 'mq'],
                init: waiter(2000),
                deinit: waiter(2000),
                needed: true
            },
        });

        this.timeout(30000);
        const time = Date.now();
        tree.on('module-state', (moduleName, state) => {
            console.log(Date.now()-time, 'module-state>>', moduleName, State[state]);
        });
        tree.on('started', () => {
            console.log('started');
            // tree.deinit();
        });
        tree.on('state', state => {
            console.log('state', State[state]);
        });
        tree.on('stopped', () => {
            done();
        });
        tree.init();
    });

});