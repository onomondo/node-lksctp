const create = ({ maxMicrotasksPerMacrotask }) => {

    let microtaskFunctionQueue = [];
    let microtasksExecutedInCurrentMacrotask = 0;
    let clearMicrotasksCounterSchedule = undefined;

    let dispatcherRunning = false;

    const maybeStartDispatcher = () => {
        if (!dispatcherRunning && microtaskFunctionQueue.length > 0 && microtasksExecutedInCurrentMacrotask < maxMicrotasksPerMacrotask) {
            dispatcherRunning = true;

            Promise.resolve().then(() => {

                while (microtasksExecutedInCurrentMacrotask < maxMicrotasksPerMacrotask && microtaskFunctionQueue.length > 0) {
                    const fn = microtaskFunctionQueue.shift();
                    fn();

                    microtasksExecutedInCurrentMacrotask += 1;

                    if (clearMicrotasksCounterSchedule === undefined) {
                        clearMicrotasksCounterSchedule = setTimeout(() => {
                            clearMicrotasksCounterSchedule = undefined;
                            microtasksExecutedInCurrentMacrotask = 0;
                            maybeStartDispatcher();
                        }, 0);
                    }
                }

                dispatcherRunning = false;
            });
        }
    };

    const scheduleMicrotask = (fn) => {

        microtaskFunctionQueue.push(fn);
        maybeStartDispatcher();

        const pending = () => {
            return microtaskFunctionQueue.includes(fn);
        };

        const cancel = () => {
            const index = microtaskFunctionQueue.indexOf(fn);
            if (index !== -1) {
                microtaskFunctionQueue.splice(index, 1);
            }
        };

        return {
            pending,
            cancel
        };
    };

    return {
        scheduleMicrotask
    };
};

module.exports = {
    create
};
