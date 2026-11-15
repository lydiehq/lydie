// Trackpad scroll events with their phases, for two-finger swipe navigation (macOS).
//
// Chromium drops NSEvent's scroll phases before a wheel event reaches the page, so the page cannot
// tell fingers resting from fingers lifting, or a swipe from the momentum after it. An AppKit local
// monitor sees each scroll event before Chromium does; this module reports the ones of an observed
// window that carry a phase (trackpad, Magic Mouse) to JavaScript, unchanged and unconsumed.
//
//   observe(windowHandle: Buffer, listener: (event) => void): number   // main thread
//   unobserve(id: number): void
//   simulate(windowHandle: Buffer, events: object[]): void            // e2e tests: posts events
//
// Built by scripts/build-native.ts (xcrun clang++, universal binary).
#import <AppKit/AppKit.h>
#include <node_api.h>

#include <cstring>
#include <map>

namespace {

struct Sample {
  NSEventPhase phase;
  NSEventPhase momentum;
  double deltaX;
  double deltaY;
  double x;
  double y;
  double timeStamp;
  bool inverted;
  bool swipeEnabled;
};

struct Observer {
  id monitor;
  napi_threadsafe_function listener;
};

// Touched on the main thread only (observe, unobserve and the monitor all run there).
std::map<int32_t, Observer> observers;
int32_t nextId = 1;

const char* phaseName(NSEventPhase phase) {
  if (phase & NSEventPhaseBegan) return "began";
  if (phase & NSEventPhaseChanged) return "changed";
  if (phase & NSEventPhaseEnded) return "ended";
  if (phase & NSEventPhaseCancelled) return "cancelled";
  if (phase & NSEventPhaseStationary) return "stationary";
  if (phase & NSEventPhaseMayBegin) return "mayBegin";
  return "none";
}

napi_value throwError(napi_env env, const char* message) {
  napi_throw_error(env, nullptr, message);
  return nullptr;
}

void setNumber(napi_env env, napi_value object, const char* key, double value) {
  napi_value v;
  napi_create_double(env, value, &v);
  napi_set_named_property(env, object, key, v);
}

void setBool(napi_env env, napi_value object, const char* key, bool value) {
  napi_value v;
  napi_get_boolean(env, value, &v);
  napi_set_named_property(env, object, key, v);
}

void setString(napi_env env, napi_value object, const char* key, const char* value) {
  napi_value v;
  napi_create_string_utf8(env, value, NAPI_AUTO_LENGTH, &v);
  napi_set_named_property(env, object, key, v);
}

// Runs on the JS thread (the main thread in Electron's main process) for each queued sample.
void callListener(napi_env env, napi_value listener, void*, void* data) {
  Sample* sample = static_cast<Sample*>(data);
  if (env != nullptr && listener != nullptr) {
    napi_value event;
    napi_create_object(env, &event);
    setString(env, event, "phase", phaseName(sample->phase));
    setString(env, event, "momentumPhase", phaseName(sample->momentum));
    setNumber(env, event, "scrollingDeltaX", sample->deltaX);
    setNumber(env, event, "scrollingDeltaY", sample->deltaY);
    setNumber(env, event, "x", sample->x);
    setNumber(env, event, "y", sample->y);
    setNumber(env, event, "timeStamp", sample->timeStamp);
    setBool(env, event, "inverted", sample->inverted);
    setBool(env, event, "swipeEnabled", sample->swipeEnabled);
    napi_value global;
    napi_get_global(env, &global);
    napi_call_function(env, global, listener, 1, &event, nullptr);
  }
  delete sample;
}

// Posted events (simulate) have no window; they carry it in the source user data instead.
NSInteger windowNumberOf(NSEvent* event) {
  if (event.windowNumber != 0) return event.windowNumber;
  return static_cast<NSInteger>(
      CGEventGetIntegerValueField(event.CGEvent, kCGEventSourceUserData));
}

NSWindow* windowFromHandle(napi_env env, napi_value value) {
  bool isBuffer = false;
  napi_is_buffer(env, value, &isBuffer);
  if (!isBuffer) return nil;
  void* data = nullptr;
  size_t length = 0;
  napi_get_buffer_info(env, value, &data, &length);
  if (length < sizeof(void*)) return nil;
  void* pointer = nullptr;
  std::memcpy(&pointer, data, sizeof(void*));
  // BrowserWindow.getNativeWindowHandle() is the window's content NSView.
  NSView* view = (__bridge NSView*)pointer;
  return view.window;
}

napi_value Observe(napi_env env, napi_callback_info info) {
  if (![NSThread isMainThread]) return throwError(env, "observe must run on the main thread");
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc < 2) return throwError(env, "observe(windowHandle, listener)");
  NSWindow* window = windowFromHandle(env, args[0]);
  if (window == nil) return throwError(env, "Not a window handle");

  napi_value name;
  napi_create_string_utf8(env, "lydie-trackpad", NAPI_AUTO_LENGTH, &name);
  napi_threadsafe_function listener;
  if (napi_create_threadsafe_function(env, args[1], nullptr, name, 0, 1, nullptr, nullptr, nullptr,
                                      callListener, &listener) != napi_ok) {
    return throwError(env, "Could not create the scroll listener");
  }
  // Observing never keeps the process alive.
  napi_unref_threadsafe_function(env, listener);

  __weak NSWindow* weakWindow = window;
  id monitor = [NSEvent
      addLocalMonitorForEventsMatchingMask:NSEventMaskScrollWheel
                                   handler:^NSEvent*(NSEvent* event) {
                                     NSWindow* target = weakWindow;
                                     if (target == nil || windowNumberOf(event) != target.windowNumber)
                                       return event;
                                     // Mouse wheels carry no phase: nothing to report.
                                     if (event.phase == NSEventPhaseNone &&
                                         event.momentumPhase == NSEventPhaseNone)
                                       return event;
                                     NSView* content = target.contentView;
                                     // A posted event without a window has its location on screen.
                                     NSPoint inWindow =
                                         event.window != nil
                                             ? event.locationInWindow
                                             : [target convertPointFromScreen:event.locationInWindow];
                                     NSPoint point = [content convertPoint:inWindow fromView:nil];
                                     Sample* sample = new Sample{
                                         event.phase,
                                         event.momentumPhase,
                                         event.scrollingDeltaX,
                                         event.scrollingDeltaY,
                                         point.x,
                                         content.isFlipped ? point.y
                                                           : NSHeight(content.bounds) - point.y,
                                         event.timestamp * 1000.0,
                                         static_cast<bool>(event.isDirectionInvertedFromDevice),
                                         static_cast<bool>(
                                             NSEvent.isSwipeTrackingFromScrollEventsEnabled),
                                     };
                                     if (napi_call_threadsafe_function(listener, sample,
                                                                       napi_tsfn_nonblocking) !=
                                         napi_ok)
                                       delete sample;
                                     return event;
                                   }];
  if (monitor == nil) {
    napi_release_threadsafe_function(listener, napi_tsfn_abort);
    return throwError(env, "Could not monitor scroll events");
  }

  int32_t id = nextId++;
  observers[id] = Observer{monitor, listener};
  napi_value result;
  napi_create_int32(env, id, &result);
  return result;
}

napi_value Unobserve(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  int32_t id = 0;
  if (argc < 1 || napi_get_value_int32(env, args[0], &id) != napi_ok) return nullptr;
  auto found = observers.find(id);
  if (found == observers.end()) return nullptr;
  [NSEvent removeMonitor:found->second.monitor];
  napi_release_threadsafe_function(found->second.listener, napi_tsfn_release);
  observers.erase(found);
  return nullptr;
}

double numberProperty(napi_env env, napi_value object, const char* key) {
  napi_value value;
  double number = 0;
  if (napi_get_named_property(env, object, key, &value) == napi_ok)
    napi_get_value_double(env, value, &number);
  return number;
}

// For end-to-end tests: posts trackpad-like scroll events at the window's centre. Each event is
// { phase, momentumPhase } (CGScrollPhase / CGMomentumScrollPhase values) and
// { deltaX, deltaY } in points, positive to scroll left/up as NSEvent's scrollingDelta.
napi_value Simulate(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc < 2) return throwError(env, "simulate(windowHandle, events)");
  NSWindow* window = windowFromHandle(env, args[0]);
  if (window == nil) return throwError(env, "Not a window handle");
  uint32_t count = 0;
  napi_get_array_length(env, args[1], &count);

  NSRect frame = window.frame;
  CGFloat screenHeight = NSHeight(NSScreen.screens.firstObject.frame);
  CGPoint location = CGPointMake(NSMidX(frame), screenHeight - NSMidY(frame));
  for (uint32_t i = 0; i < count; i++) {
    napi_value item;
    napi_get_element(env, args[1], i, &item);
    double deltaX = numberProperty(env, item, "deltaX");
    double deltaY = numberProperty(env, item, "deltaY");
    CGEventRef cg = CGEventCreateScrollWheelEvent2(nullptr, kCGScrollEventUnitPixel, 2,
                                                   static_cast<int32_t>(deltaY),
                                                   static_cast<int32_t>(deltaX), 0);
    CGEventSetLocation(cg, location);
    CGEventSetTimestamp(cg, clock_gettime_nsec_np(CLOCK_UPTIME_RAW));
    CGEventSetIntegerValueField(cg, kCGScrollWheelEventIsContinuous, 1);
    CGEventSetDoubleValueField(cg, kCGScrollWheelEventFixedPtDeltaAxis1, deltaY);
    CGEventSetDoubleValueField(cg, kCGScrollWheelEventFixedPtDeltaAxis2, deltaX);
    CGEventSetIntegerValueField(cg, kCGScrollWheelEventPointDeltaAxis1,
                                static_cast<int64_t>(deltaY));
    CGEventSetIntegerValueField(cg, kCGScrollWheelEventPointDeltaAxis2,
                                static_cast<int64_t>(deltaX));
    CGEventSetIntegerValueField(cg, kCGScrollWheelEventScrollPhase,
                                static_cast<int64_t>(numberProperty(env, item, "phase")));
    CGEventSetIntegerValueField(cg, kCGScrollWheelEventMomentumPhase,
                                static_cast<int64_t>(numberProperty(env, item, "momentumPhase")));
    CGEventSetIntegerValueField(cg, kCGEventSourceUserData, window.windowNumber);
    NSEvent* event = [NSEvent eventWithCGEvent:cg];
    CFRelease(cg);
    if (event != nil) [NSApp postEvent:event atStart:NO];
  }
  return nullptr;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"observe", nullptr, Observe, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"unobserve", nullptr, Unobserve, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"simulate", nullptr, Simulate, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
