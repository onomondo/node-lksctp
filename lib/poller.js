const native = require("./native.js");

const create = ({ fd, callback, name }) => {

    let pending = false;
    let closed = false;

    const nativePollHandle = native.create_poller({
        fd,

        callback: (args) => {

            if (pending) {
                // raise unhandled exception
                // this should never happen
                Promise.resolve().then(() => {
                    throw Error("poller callback before microtask was run, this should not happen");
                });
            }

            // schedule a microtask to run the callback
            // otherwise, exceptions will be reported to native code
            // we want it to raise an uncaught exception
            pending = true;
            Promise.resolve().then(() => {
                pending = false;

                if (closed) {
                    return;
                }

                callback(args);
            });

            // always report back to native code immediately
            // and without any exceptions

            // handling errors in native code is tricky
        }
    });

    let lastEvents = {
        readable: false,
        writable: false
    };

    const update = ({ events }) => {
        if (events.readable !== lastEvents.readable || events.writable !== lastEvents.writable) {

            if (events.readable || events.writable) {
                nativePollHandle.start({ events });
            } else {
                nativePollHandle.stop();
            }

            lastEvents = {
                readable: events.readable,
                writable: events.writable
            };
        }
    };

    const close = () => {
        closed = true;
        nativePollHandle.close();
    };

    return {
        update,
        close
    };
};

module.exports = {
    create
};
