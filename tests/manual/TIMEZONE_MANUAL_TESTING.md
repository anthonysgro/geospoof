# Manual Testing Checklist: Timezone Spoofing and Status Display

This document provides a comprehensive manual testing checklist for the timezone spoofing and status display feature.

## Prerequisites

- Firefox browser with the GeoSpoof extension installed
- Access to the following websites:
  - OpenStreetMap (https://www.openstreetmap.org)
  - Google Maps (https://www.google.com/maps)
  - Time.is (https://time.is) - timezone-aware website
  - WorldTimeBuddy (https://www.worldtimebuddy.com) - timezone comparison tool

## Test 1: OpenStreetMap with Various Locations

### Objective

Verify timezone spoofing works on OpenStreetMap (CSP-protected site) with different locations.

### Steps

1. Open OpenStreetMap (https://www.openstreetmap.org)
2. Open the GeoSpoof extension popup
3. Search for "Tokyo, Japan" and select it
4. Enable protection
5. Open browser console (F12)
6. Run: `new Date().getTimezoneOffset()`
   - **Expected**: Should return `-540` (UTC+9 for Tokyo)
7. Run: `Intl.DateTimeFormat().resolvedOptions().timeZone`
   - **Expected**: Should return `"Asia/Tokyo"`
8. Run: `new Date().toString()`
   - **Expected**: Should show Tokyo timezone in the output

### Repeat for Other Locations

- Los Angeles, CA, USA (UTC-8, DST)
- London, England, UK (UTC+0, DST)
- Sydney, Australia (UTC+10, DST)
- Dubai, UAE (UTC+4, no DST)

### Success Criteria

- ✅ All timezone APIs return spoofed values
- ✅ No console errors
- ✅ OpenStreetMap functions normally
- ✅ Geolocation also spoofed correctly

---

## Test 2: Google Maps Timezone Verification

### Objective

Verify timezone spoofing works on Google Maps.

### Steps

1. Open Google Maps (https://www.google.com/maps)
2. Set location to "Paris, France" via GeoSpoof
3. Enable protection
4. Open browser console
5. Run: `new Date().getTimezoneOffset()`
   - **Expected**: Should return `-60` (UTC+1 for Paris)
6. Run: `Intl.DateTimeFormat().resolvedOptions().timeZone`
   - **Expected**: Should return `"Europe/Paris"`
7. Check if Google Maps shows the correct location

### Success Criteria

- ✅ Timezone APIs return Paris timezone
- ✅ Geolocation shows Paris coordinates
- ✅ Google Maps functions normally

---

## Test 3: Time.is Timezone Display

### Objective

Verify timezone spoofing affects timezone-aware websites.

### Steps

1. Open Time.is (https://time.is)
2. Note the current timezone displayed
3. Set location to "New York, NY, USA" via GeoSpoof
4. Enable protection
5. Refresh the page
6. Check the timezone displayed on Time.is
   - **Expected**: Should show New York time (EST/EDT)
7. Open console and verify:
   - `new Date().getTimezoneOffset()` returns `300` (UTC-5)
   - `Intl.DateTimeFormat().resolvedOptions().timeZone` returns `"America/New_York"`

### Success Criteria

- ✅ Time.is displays New York timezone
- ✅ Time matches New York time
- ✅ No console errors

---

## Test 4: Popup UI Status Display

### Objective

Verify the popup UI correctly displays spoofed location, timezone, and overridden APIs.

### Steps

1. Set location to "Berlin, Germany"
2. Enable protection
3. Open the GeoSpoof popup
4. Verify the following are displayed:
   - **Spoofed Location**: Shows Berlin coordinates (52.5200, 13.4050) with accuracy
   - **Spoofed Timezone**: Shows "Europe/Berlin (UTC+01:00)" or similar
   - **Overridden APIs**: Lists:
     - navigator.geolocation.getCurrentPosition
     - navigator.geolocation.watchPosition
     - Date.prototype.getTimezoneOffset
     - Intl.DateTimeFormat
     - Date formatting methods
   - **WebRTC Protection**: Shows status (Active/Inactive)

### Success Criteria

- ✅ All status information displayed correctly
- ✅ Coordinates formatted to 4 decimal places
- ✅ Timezone offset formatted as UTC±HH:MM
- ✅ All overridden APIs listed
- ✅ WebRTC status shown

---

## Test 5: Fallback Timezone Indication

### Objective

Verify popup displays "(estimated)" indicator for fallback timezones.

### Steps

1. Disconnect from internet (or use browser dev tools to block timezone API)
2. Set location to "0, 0" (Null Island)
3. Enable protection
4. Open popup
5. Check timezone display
   - **Expected**: Should show "UTC (UTC+00:00) (estimated)" or similar

### Success Criteria

- ✅ Fallback timezone is used
- ✅ "(estimated)" indicator is shown
- ✅ Geolocation still works

---

## Test 6: Multiple Location Changes

### Objective

Verify timezone updates correctly when changing locations.

### Steps

1. Set location to "Tokyo, Japan"
2. Enable protection
3. Open console on any website
4. Run: `new Date().getTimezoneOffset()`
   - **Expected**: `-540` (Tokyo)
5. Change location to "Los Angeles, CA, USA"
6. Run: `new Date().getTimezoneOffset()` again
   - **Expected**: `480` (Los Angeles)
7. Change location to "London, England, UK"
8. Run: `new Date().getTimezoneOffset()` again
   - **Expected**: `0` (London)

### Success Criteria

- ✅ Timezone updates immediately after location change
- ✅ No page refresh required
- ✅ All timezone APIs reflect new timezone

---

## Test 7: DST Handling

### Objective

Verify DST (Daylight Saving Time) is handled correctly.

### Steps

1. Set location to "New York, NY, USA" (has DST)
2. Enable protection
3. Open console
4. Run: `new Date().getTimezoneOffset()`
   - **Expected**: `-300` (EST) or `-240` (EDT) depending on current date
5. Set location to "Phoenix, AZ, USA" (no DST)
6. Run: `new Date().getTimezoneOffset()`
   - **Expected**: `420` (MST, no DST adjustment)

### Success Criteria

- ✅ DST offset applied for locations with DST
- ✅ No DST offset for locations without DST
- ✅ Correct offset for current date

---

## Test 8: Date Formatting Methods

### Objective

Verify Date formatting methods use spoofed timezone.

### Steps

1. Set location to "Sydney, Australia"
2. Enable protection
3. Open console
4. Create a date: `const d = new Date('2024-01-01T12:00:00Z')`
5. Run the following and verify timezone in output:
   - `d.toString()` - Should show Sydney timezone
   - `d.toTimeString()` - Should show Sydney time
   - `d.toLocaleString()` - Should use Sydney timezone
   - `d.toLocaleDateString()` - Should use Sydney timezone
   - `d.toLocaleTimeString()` - Should use Sydney timezone

### Success Criteria

- ✅ All formatting methods reflect Sydney timezone
- ✅ No errors thrown
- ✅ Output is readable and correct

---

## Test 9: Error Scenarios

### Objective

Verify graceful handling of error scenarios.

### Steps

#### 9.1 Missing Timezone Data

1. Use browser dev tools to block requests to the browser-geo-tz CDN (unpkg.com)
2. Set location to any coordinates
3. Enable protection
4. Verify:
   - Geolocation still works
   - Fallback timezone is used
   - Popup shows "(estimated)" for timezone

#### 9.2 Invalid Coordinates

1. Try to set location to invalid coordinates (e.g., latitude > 90)
2. Verify error message is shown
3. Verify extension doesn't crash

#### 9.3 Rapid Location Changes

1. Quickly change location 5-10 times
2. Verify:
   - Extension remains responsive
   - Final location is correct
   - No console errors

### Success Criteria

- ✅ Extension handles errors gracefully
- ✅ Geolocation continues working
- ✅ Clear error messages shown
- ✅ No crashes or freezes

---

## Test 10: WebRTC Protection Integration

### Objective

Verify timezone spoofing works alongside WebRTC protection.

### Steps

1. Set location to "Paris, France"
2. Enable protection
3. Enable WebRTC protection
4. Open popup and verify:
   - Location shows Paris
   - Timezone shows Europe/Paris
   - WebRTC protection shows "Active"
5. Open console and verify timezone APIs work
6. Test WebRTC (e.g., on https://browserleaks.com/webrtc)

### Success Criteria

- ✅ Both protections active simultaneously
- ✅ Timezone spoofing works
- ✅ WebRTC protection works
- ✅ No conflicts between features

---

## Test 11: CSP Compatibility

### Objective

Verify timezone spoofing works on sites with strict Content Security Policy.

### Steps

1. Open OpenStreetMap (strict CSP)
2. Set location to "Berlin, Germany"
3. Enable protection
4. Open console
5. Verify no CSP errors
6. Run: `new Date().getTimezoneOffset()`
   - **Expected**: `-60` (Berlin)
7. Verify OpenStreetMap functions normally

### Repeat for Other CSP-Protected Sites

- GitHub (https://github.com)
- Any site with strict CSP

### Success Criteria

- ✅ No CSP violations in console
- ✅ Timezone spoofing works
- ✅ Site functions normally

---

## Test 12: Performance

### Objective

Verify timezone spoofing doesn't cause performance issues.

### Steps

1. Open a complex web application (e.g., Google Maps)
2. Enable timezone spoofing
3. Interact with the application (zoom, pan, search)
4. Monitor:
   - Page responsiveness
   - Console for errors
   - Memory usage (browser task manager)
5. Change location multiple times
6. Verify no performance degradation

### Success Criteria

- ✅ No noticeable performance impact
- ✅ Page remains responsive
- ✅ No memory leaks
- ✅ Smooth operation

---

## Test 13: Timezone with 30/45 Minute Offsets

### Objective

Verify timezones with non-hour offsets work correctly.

### Steps

1. Set location to "New Delhi, India" (UTC+5:30)
2. Enable protection
3. Run: `new Date().getTimezoneOffset()`
   - **Expected**: `-330` (5.5 hours \* 60 minutes)
4. Set location to "Kathmandu, Nepal" (UTC+5:45)
5. Run: `new Date().getTimezoneOffset()`
   - **Expected**: `-345` (5.75 hours \* 60 minutes)

### Success Criteria

- ✅ Non-hour offsets calculated correctly
- ✅ Timezone identifier correct
- ✅ Date formatting works

---

## Test 14: Extreme Timezone Offsets

### Objective

Verify extreme timezone offsets work correctly.

### Steps

1. Set location to "Kiritimati, Kiribati" (UTC+14, easternmost)
2. Enable protection
3. Run: `new Date().getTimezoneOffset()`
   - **Expected**: `-840` (14 hours \* 60 minutes)
4. Set location to "Pago Pago, American Samoa" (UTC-11, far west)
5. Run: `new Date().getTimezoneOffset()`
   - **Expected**: `660` (11 hours \* 60 minutes)

### Success Criteria

- ✅ Extreme offsets work correctly
- ✅ No overflow or calculation errors
- ✅ Date formatting works

---

## Test 15: Disable Protection

### Objective

Verify disabling protection restores original timezone.

### Steps

1. Note your real timezone offset: `new Date().getTimezoneOffset()`
2. Set location to "Tokyo, Japan"
3. Enable protection
4. Verify timezone changed to Tokyo
5. Disable protection
6. Run: `new Date().getTimezoneOffset()`
   - **Expected**: Should return your real timezone offset
7. Verify popup shows "None (protection disabled)" for overridden APIs

### Success Criteria

- ✅ Original timezone restored
- ✅ All timezone APIs return real values
- ✅ Popup reflects disabled state

---

## Reporting Issues

If any test fails, please report with:

- Test number and name
- Steps to reproduce
- Expected vs actual behavior
- Browser console errors (if any)
- Screenshots of popup UI (if relevant)
- Firefox version
- Extension version

---

## Summary Checklist

After completing all tests, verify:

- [ ] Timezone spoofing works on OpenStreetMap
- [ ] Timezone spoofing works on Google Maps
- [ ] Timezone spoofing works on timezone-aware websites
- [ ] Popup UI displays all status information correctly
- [ ] Fallback timezone indication works
- [ ] Multiple location changes work smoothly
- [ ] DST handling is correct
- [ ] Date formatting methods use spoofed timezone
- [ ] Error scenarios handled gracefully
- [ ] WebRTC protection integration works
- [ ] CSP compatibility maintained
- [ ] No performance issues
- [ ] Non-hour timezone offsets work
- [ ] Extreme timezone offsets work
- [ ] Disabling protection restores original timezone

---

## Notes

- Some tests require specific dates to verify DST behavior
- Timezone resolution uses browser-geo-tz boundary data loaded from CDN; results may vary if CDN is unavailable
- Fallback timezone is estimated and may not be 100% accurate
- Manual testing should be performed on a clean Firefox profile to avoid conflicts with other extensions
