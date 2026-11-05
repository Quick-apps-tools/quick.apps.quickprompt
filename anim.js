/* TweenMax controls adapted from RareApps Prompter for the #lyrics scroll area. */
(function () {
    "use strict";

    window.initPrompterControls = function (options) {
        const lyrics = options.lyrics;
        const prompter = options.prompter;
        const onHome = options.onHome || function () {};

        // These values preserve the current requested speeds: 1 = 75 px/s,
        // 2 = 100 px/s, then 3–9 rise in 50 px/s steps.
        let speed = 12; // arrow keys: 60 px/s
        let direction = 2; // 1 = up, 2 = down
        let isMoving = false;
        let scrollMode = "none";

        const speedMap = {
            97: 15, 98: 20, 99: 30, 100: 40, 101: 50,
            102: 60, 103: 70, 104: 80, 105: 90,
            49: 15, 50: 20, 51: 30, 52: 40, 53: 50,
            54: 60, 55: 70, 56: 80, 57: 90
        };

        function stopScrolling() {
            isMoving = false;
            scrollMode = "none";
            TweenMax.killTweensOf(lyrics);
        }

        function scrollAtCurrentSpeed() {
            TweenMax.killTweensOf(lyrics);

            const current = lyrics.scrollTop;
            const maxScroll = Math.max(0, lyrics.scrollHeight - lyrics.clientHeight);
            const target = direction === 2 ? maxScroll : 0;
            const distance = Math.abs(target - current);

            if (distance < 1) {
                isMoving = false;
                scrollMode = "none";
                return;
            }

            isMoving = true;
            const duration = distance / (speed * 5);
            TweenMax.to(lyrics, duration, {
                scrollTo: { y: target, autoKill: false },
                ease: Linear.easeNone,
                overwrite: "auto",
                onComplete: function () {
                    isMoving = false;
                    scrollMode = "none";
                }
            });
        }

        function handleKeys(event) {
            if (prompter.style.display !== "block") return;
            const key = event.keyCode;

            if (event.ctrlKey && (key === 66 || event.key.toLowerCase() === "b")) {
                event.preventDefault();
                stopScrolling();
                onHome();
                return;
            }

            if (key === 27) {
                event.preventDefault();
                stopScrolling();
                TweenMax.to(lyrics, 0.7, {
                    scrollTo: { y: 0, autoKill: false },
                    ease: Power2.easeInOut,
                    overwrite: "auto"
                });
                return;
            }

            // Arrow Down stops number-key auto-scroll as soon as it is pressed.
            if (key === 40 && isMoving && scrollMode === "auto") {
                event.preventDefault();
                stopScrolling();
                return;
            }

            if (key === 32 || key === 13 || key === 96 || key === 48) {
                event.preventDefault();
                stopScrolling();
                return;
            }

            if (speedMap[key]) {
                event.preventDefault();
                if (event.repeat) return;
                speed = speedMap[key];
                direction = 2;
                scrollMode = "auto";
                scrollAtCurrentSpeed();
                return;
            }

            if (key === 38 || key === 40) {
                event.preventDefault();
                if (event.repeat) return;
                direction = key === 38 ? 1 : 2;
                scrollMode = "arrow";
                scrollAtCurrentSpeed();
            }
        }

        function handleKeyUp(event) {
            if (prompter.style.display !== "block") return;
            if ((event.keyCode === 38 || event.keyCode === 40) && scrollMode === "arrow") {
                event.preventDefault();
                stopScrolling();
            }
        }

        window.addEventListener("keydown", handleKeys, true);
        window.addEventListener("keyup", handleKeyUp, true);
        prompter.addEventListener("mousedown", stopScrolling);

        return stopScrolling;
    };
})();