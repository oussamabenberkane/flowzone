# Manual checklist: real devices and push

Written for: the owner, who checks FlowZone on their own phone and computer. The automated suite cannot do these steps (push needs a real browser push service, a real phone, and a real HTTPS address).

**Status: not run by QA.** Nothing on this page has been performed on a real device yet. The results columns are for the owner.

## Before you start

1. **A deployed app over HTTPS**, production or a preview. Push and "Add to Home Screen" need HTTPS. Google sign-in does **not** work on preview addresses (foundation handoff, section 6), so use **production** for the Google steps.
2. **Settings are in place** on Vercel: `NUDGE_TICK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (see [setup guide](../setup.md)). `NUDGE_TEST_CLOCK` must **not** be set.
3. **The scheduler can reach the tick endpoint.** Until defect **D-01** is fixed (see [defects](defects.md)), the scheduled tick is refused with `401`, so no scheduled nudge will arrive. Check D-01 first.
4. Your two allowed accounts are on `ALLOWED_EMAILS`.
5. Keep a note of the date and time of each test. Do not record task titles or personal text in this file; write "task A" instead.

Result codes: **P** pass, **F** fail (describe it in Notes), **N** not run, **N/A** does not apply to this device.

---

## A. Sign-in (any device, production address)

| #   | Step                                           | Expected                                                                   | Result | Notes |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------- | ------ | ----- |
| A1  | Visit `https://<production>/` while signed out | You land on the sign-in page with "Continue with Google"                   |        |       |
| A2  | Sign in with the first allowed Google account  | Today opens; you can sign out                                              |        |       |
| A3  | Sign in with the second allowed Google account | Today opens for that account (its tasks differ from the first)             |        |       |
| A4  | Sign in with any other Google account          | "That Google account isn't on the invite list yet…"; no account is created |        |       |
| A5  | Open `https://<production>/api/health`         | `{"status":"ok","checks":{"app":"ok","database":"ok"}}`                    |        |       |

## B. Android Chrome

| #   | Step                                                                                     | Expected                                                                                                                     | Result | Notes |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| B1  | Open the production address in Chrome, sign in                                           | Today shows                                                                                                                  |        |       |
| B2  | Settings → turn **Nudges** on                                                            | The notifications section appears; **nothing asks for permission yet**                                                       |        |       |
| B3  | Tap **Allow notifications on this device**                                               | Chrome asks once; allow. The device appears in "Your devices" with a label                                                   |        |       |
| B4  | Tap **Send a test notification**                                                         | It arrives within about a minute. Its text says it was asked for in Settings                                                 |        |       |
| B5  | Tap the test notification                                                                | FlowZone opens at Settings                                                                                                   |        |       |
| B6  | Create a task due today with a time in the next two hours (for example 2 hours from now) | At the next scheduled run (every 30 minutes, GitHub may delay it), a nudge arrives with its reason ("… is due at …")         |        |       |
| B7  | Tap that nudge                                                                           | FlowZone opens the task                                                                                                      |        |       |
| B8  | On the nudge, tap **Not today** (if shown)                                               | Reopen the task: its control says nudges are paused                                                                          |        |       |
| B9  | On the task page, tap **Stop nudges for this task**, then **Turn nudges back on**        | The task itself is unchanged; nudges resume                                                                                  |        |       |
| B10 | Remove this device from "Your devices"                                                   | A later test notification does not arrive on it; Chrome's own subscription is gone (chrome://settings/content/notifications) |        |       |
| B11 | Turn **Nudges** off                                                                      | No nudge arrives, even for a task that is due                                                                                |        |       |
| B12 | Install FlowZone (Chrome menu → Install app)                                             | It opens in its own window with the FlowZone icon                                                                            |        |       |

## C. Windows Chrome (desktop)

| #   | Step                                                                       | Expected                                                                              | Result | Notes |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ | ----- |
| C1  | Sign in; Settings → **Nudges** on → **Allow notifications on this device** | Chrome asks once; allow                                                               |        |       |
| C2  | **Send a test notification**                                               | A Windows notification appears                                                        |        |       |
| C3  | Repeat B6 and B11                                                          | As on Android                                                                         |        |       |
| C4  | Turn the Windows Focus assist / "Do not disturb" on, then send a test      | Windows may hold it; note what happens (this is the device's setting, not FlowZone's) |        |       |
| C5  | Install FlowZone (address bar install icon)                                | Opens as an app window                                                                |        |       |

## D. iPhone (iOS 16.4 or later is required for web push)

| #   | Step                                                                                  | Expected                                                                                                                  | Result | Notes |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------ | ----- |
| D1  | Open the production address in **Safari**                                             | Sign-in page                                                                                                              |        |       |
| D2  | Share → **Add to Home Screen**, then open FlowZone from the Home Screen               | It opens as an app, signed in                                                                                             |        |       |
| D3  | In the Home Screen app, Settings → Nudges on → **Allow notifications on this device** | iOS asks; allow. The device appears in the list                                                                           |        |       |
| D4  | **Send a test notification**                                                          | It arrives on the lock screen                                                                                             |        |       |
| D5  | Repeat B6 and B9                                                                      | As on Android                                                                                                             |        |       |
| D6  | Open the production address in **Chrome on iPhone**                                   | Note whether it signs in and whether Nudges can be turned on. Record the result; do not assume                            |        |       |
| D7  | In Chrome on iPhone, try "Add to Home Screen"                                         | Note whether it installs and whether notifications work there (on iPhone, web push works only for apps added from Safari) |        |       |

## E. Offline and layout (phone)

| #   | Step                                                                                 | Expected                                                                                                                 | Result | Notes |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------ | ----- |
| E1  | Open Today once while online; then turn on **airplane mode** and open the app again  | Today opens from the copy saved on the device, marked as offline, with plan buttons turned off                           |        |       |
| E2  | In airplane mode, capture a task                                                     | The capture is kept on the device ("waiting to be sent")                                                                 |        |       |
| E3  | Turn airplane mode off                                                               | The task appears once in the Inbox (not twice)                                                                           |        |       |
| E4  | Settings → text size **Largest** and dyslexia-friendly font on; open Today and Inbox | Task rows wrap and stay readable; nothing is cut off or scrolls sideways (see [defects](defects.md), item on large text) |        |       |
| E5  | Turn on **Less motion**; open a few screens                                          | Little or no movement                                                                                                    |        |       |
| E6  | Rotate the phone to landscape                                                        | Layout still usable; navigation still reachable                                                                          |        |       |

## F. Keyboard and screen reader (desktop, optional)

| #   | Step                                                        | Expected                                            | Result | Notes |
| --- | ----------------------------------------------------------- | --------------------------------------------------- | ------ | ----- |
| F1  | Using only the keyboard, capture a task and complete it     | Possible; focus is always visible                   |        |       |
| F2  | Screen reader (Windows Narrator or NVDA) on Today and Focus | Headings and buttons are announced with clear names |        |       |

---

## Sign-off

| Device                    | Tester | Date | Passed | Failed | Not run |
| ------------------------- | ------ | ---- | ------ | ------ | ------- |
| Android Chrome            |        |      |        |        |         |
| Windows Chrome            |        |      |        |        |         |
| iPhone Safari (installed) |        |      |        |        |         |
| iPhone Chrome             |        |      |        |        |         |

When a step fails, add the result to [defects](defects.md) with the device, the steps and what you saw (no personal content).
