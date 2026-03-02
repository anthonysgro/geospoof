/**
 * Unit tests for popup HTML structure
 * Validates: Requirements 4.1, 5.1
 */

const fs = require('fs');
const path = require('path');

describe('Popup HTML Structure', () => {
  let document;

  beforeEach(() => {
    // Load popup.html
    const html = fs.readFileSync(
      path.join(__dirname, '../../../popup/popup.html'),
      'utf8'
    );
    document = new DOMParser().parseFromString(html, 'text/html');
  });

  test('should have header with title and status badge', () => {
    const header = document.querySelector('.header');
    expect(header).toBeTruthy();
    
    const title = document.querySelector('.header h1');
    expect(title).toBeTruthy();
    expect(title.textContent).toBe('GeoSpoof');
    
    const statusBadge = document.getElementById('statusBadge');
    expect(statusBadge).toBeTruthy();
    
    const statusText = document.getElementById('statusText');
    expect(statusText).toBeTruthy();
  });

  test('should have protection toggle element', () => {
    const protectionToggle = document.getElementById('protectionToggle');
    expect(protectionToggle).toBeTruthy();
    expect(protectionToggle.type).toBe('checkbox');
  });

  test('should have current location display section', () => {
    const currentLocation = document.getElementById('currentLocation');
    expect(currentLocation).toBeTruthy();
    
    const locationIcon = document.querySelector('.location-icon');
    expect(locationIcon).toBeTruthy();
    
    const locationName = document.getElementById('locationName');
    expect(locationName).toBeTruthy();
    
    const locationCoords = document.getElementById('locationCoords');
    expect(locationCoords).toBeTruthy();
  });

  test('should have location picker input field', () => {
    const locationSearch = document.getElementById('locationSearch');
    expect(locationSearch).toBeTruthy();
    expect(locationSearch.type).toBe('text');
    expect(locationSearch.placeholder).toContain('Search');
    
    const searchResults = document.getElementById('searchResults');
    expect(searchResults).toBeTruthy();
  });

  test('should have manual coordinate inputs', () => {
    const latitudeInput = document.getElementById('latitudeInput');
    expect(latitudeInput).toBeTruthy();
    expect(latitudeInput.type).toBe('number');
    expect(latitudeInput.min).toBe('-90');
    expect(latitudeInput.max).toBe('90');
    
    const longitudeInput = document.getElementById('longitudeInput');
    expect(longitudeInput).toBeTruthy();
    expect(longitudeInput.type).toBe('number');
    expect(longitudeInput.min).toBe('-180');
    expect(longitudeInput.max).toBe('180');
    
    const setButton = document.getElementById('setManualCoords');
    expect(setButton).toBeTruthy();
    expect(setButton.tagName).toBe('BUTTON');
  });

  test('should have WebRTC protection toggle', () => {
    const webrtcToggle = document.getElementById('webrtcToggle');
    expect(webrtcToggle).toBeTruthy();
    expect(webrtcToggle.type).toBe('checkbox');
  });

  test('should have warning message element', () => {
    const warningMessage = document.getElementById('warningMessage');
    expect(warningMessage).toBeTruthy();
    expect(warningMessage.style.display).toBe('none');
  });

  test('should link popup.css and popup.js', () => {
    const cssLink = document.querySelector('link[href="popup.css"]');
    expect(cssLink).toBeTruthy();
    
    const jsScript = document.querySelector('script[src="popup.js"]');
    expect(jsScript).toBeTruthy();
  });
});
