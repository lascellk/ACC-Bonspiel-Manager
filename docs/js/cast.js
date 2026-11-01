// Starts the TV page on a Cast device. Once started it fetches scores itself, so nothing
// here sends data and the phone can leave. Needs Chrome on Android or a computer.
import { CAST_APP_ID } from './config.js';
import { toast } from './view.js';

let available = false;

function explain(error) {
  if (error === chrome.cast.ErrorCode.CANCEL) return;
  // With nothing nearby, Chrome can report a general session error instead.
  const noDevices = cast.framework.CastContext.getInstance().getCastState() === cast.framework.CastState.NO_DEVICES_AVAILABLE;
  if (noDevices || error === chrome.cast.ErrorCode.RECEIVER_UNAVAILABLE) {
    toast('No Cast devices found. Check the TV is on and this device is on the same Wi-Fi.');
  } else if (error === chrome.cast.ErrorCode.SESSION_ERROR) {
    toast("The TV couldn't open the scoreboard. Restart the TV's Cast device and try again.");
  } else {
    toast(`Couldn't start casting: ${error}`);
  }
}

function onClick() {
  if (!available) {
    toast('Casting needs Chrome on an Android phone or a computer. It does not work on iPhones or iPads.');
    return;
  }
  const context = cast.framework.CastContext.getInstance();
  if (context.getCurrentSession()) {
    if (confirm('Stop casting to the TV?')) context.endCurrentSession(true);
    return;
  }
  context.requestSession().catch(explain);
}

export function setupCast(button) {
  if (!button) return;
  button.addEventListener('click', onClick);
  if (!CAST_APP_ID) return;
  window.__onGCastApiAvailable = (isAvailable) => {
    if (!isAvailable) return;
    available = true;
    const context = cast.framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: CAST_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, () => {
      button.classList.toggle('casting', Boolean(context.getCurrentSession()));
    });
  };
  const script = document.createElement('script');
  script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
  document.head.append(script);
}
