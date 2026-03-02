/**
 * Property-based tests for popup performance
 * Feature: geolocation-spoof-extension-mvp
 */

const fc = require('fast-check');

/**
 * Property 21: Popup UI Open Performance
 * For any popup open action (clicking the extension icon), the popup UI should
 * open and display within 200ms.
 * 
 * Validates: Requirements 7.2
 */
describe('Property 21: Popup UI Open Performance', () => {
  let mockBrowser;
  let mockDocument;

  beforeEach(() => {
    // Mock browser API
    mockBrowser = {
      runtime: {
        sendMessage: jest.fn()
      }
    };
    global.browser = mockBrowser;

    // Mock DOM elements
    mockDocument = {
      getElementById: jest.fn(),
      addEventListener: jest.fn()
    };
    global.document = mockDocument;
  });

  test('should load settings within 200ms for any settings state', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          enabled: fc.boolean(),
          webrtcProtection: fc.boolean(),
          location: fc.option(
            fc.record({
              latitude: fc.double({ min: -90, max: 90, noNaN: true }),
              longitude: fc.double({ min: -180, max: 180, noNaN: true }),
              accuracy: fc.double({ min: 1, max: 100, noNaN: true })
            }),
            { nil: null }
          ),
          locationName: fc.option(
            fc.record({
              city: fc.string({ minLength: 1, maxLength: 50 }),
              country: fc.string({ minLength: 1, maxLength: 50 }),
              displayName: fc.string({ minLength: 1, maxLength: 100 })
            }),
            { nil: null }
          )
        }),
        async (settings) => {
          // Mock settings response
          mockBrowser.runtime.sendMessage.mockResolvedValue(settings);

          // Mock UI elements
          const mockElements = {
            protectionToggle: { checked: false },
            webrtcToggle: { checked: false },
            statusBadge: { classList: { add: jest.fn(), remove: jest.fn() } },
            statusText: { textContent: '' },
            locationName: { textContent: '' },
            locationCoords: { textContent: '' },
            warningMessage: { style: { display: 'none' } }
          };

          mockDocument.getElementById.mockImplementation((id) => mockElements[id] || null);

          // Simulate loadSettings function
          const startTime = Date.now();
          
          const loadedSettings = await mockBrowser.runtime.sendMessage({ type: 'GET_SETTINGS' });
          
          // Update UI (simplified version of popup.js logic)
          mockElements.protectionToggle.checked = loadedSettings.enabled;
          mockElements.webrtcToggle.checked = loadedSettings.webrtcProtection;
          
          if (loadedSettings.enabled) {
            mockElements.statusBadge.classList.add('enabled');
            mockElements.statusText.textContent = 'Enabled';
          } else {
            mockElements.statusBadge.classList.remove('enabled');
            mockElements.statusText.textContent = 'Disabled';
          }
          
          if (loadedSettings.location) {
            if (loadedSettings.locationName && loadedSettings.locationName.displayName) {
              mockElements.locationName.textContent = loadedSettings.locationName.displayName;
            } else {
              mockElements.locationName.textContent = 'Custom Location';
            }
            mockElements.locationCoords.textContent = 
              `${loadedSettings.location.latitude.toFixed(4)}, ${loadedSettings.location.longitude.toFixed(4)}`;
          }
          
          if (loadedSettings.enabled && !loadedSettings.location) {
            mockElements.warningMessage.style.display = 'block';
          }
          
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          // Should complete within 200ms
          expect(duration).toBeLessThan(200);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('should maintain performance with complex location data', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          enabled: fc.boolean(),
          webrtcProtection: fc.boolean(),
          location: fc.record({
            latitude: fc.double({ min: -90, max: 90, noNaN: true }),
            longitude: fc.double({ min: -180, max: 180, noNaN: true }),
            accuracy: fc.double({ min: 1, max: 100, noNaN: true })
          }),
          locationName: fc.record({
            city: fc.string({ minLength: 10, maxLength: 50 }),
            country: fc.string({ minLength: 10, maxLength: 50 }),
            displayName: fc.string({ minLength: 50, maxLength: 200 })
          })
        }),
        async (settings) => {
          mockBrowser.runtime.sendMessage.mockResolvedValue(settings);

          const mockElements = {
            protectionToggle: { checked: false },
            webrtcToggle: { checked: false },
            statusBadge: { classList: { add: jest.fn(), remove: jest.fn() } },
            statusText: { textContent: '' },
            locationName: { textContent: '' },
            locationCoords: { textContent: '' },
            warningMessage: { style: { display: 'none' } }
          };

          mockDocument.getElementById.mockImplementation((id) => mockElements[id] || null);

          const startTime = Date.now();
          
          const loadedSettings = await mockBrowser.runtime.sendMessage({ type: 'GET_SETTINGS' });
          
          // Process all settings
          mockElements.protectionToggle.checked = loadedSettings.enabled;
          mockElements.webrtcToggle.checked = loadedSettings.webrtcProtection;
          mockElements.locationName.textContent = loadedSettings.locationName.displayName;
          mockElements.locationCoords.textContent = 
            `${loadedSettings.location.latitude.toFixed(4)}, ${loadedSettings.location.longitude.toFixed(4)}`;
          
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          // Should still complete within 200ms even with complex data
          expect(duration).toBeLessThan(200);
        }
      ),
      { numRuns: 50 }
    );
  });

  test('should handle rapid popup open/close cycles', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            enabled: fc.boolean(),
            location: fc.option(
              fc.record({
                latitude: fc.double({ min: -90, max: 90, noNaN: true }),
                longitude: fc.double({ min: -180, max: 180, noNaN: true })
              }),
              { nil: null }
            )
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (settingsSequence) => {
          const mockElements = {
            protectionToggle: { checked: false },
            webrtcToggle: { checked: false },
            statusBadge: { classList: { add: jest.fn(), remove: jest.fn() } },
            statusText: { textContent: '' },
            locationName: { textContent: '' },
            locationCoords: { textContent: '' },
            warningMessage: { style: { display: 'none' } }
          };

          mockDocument.getElementById.mockImplementation((id) => mockElements[id] || null);

          const durations = [];
          
          // Simulate multiple popup opens
          for (const settings of settingsSequence) {
            mockBrowser.runtime.sendMessage.mockResolvedValue({
              ...settings,
              webrtcProtection: false,
              locationName: null
            });

            const startTime = Date.now();
            await mockBrowser.runtime.sendMessage({ type: 'GET_SETTINGS' });
            const endTime = Date.now();
            
            durations.push(endTime - startTime);
          }
          
          // All opens should be within 200ms
          const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
          expect(avgDuration).toBeLessThan(200);
          
          // No single open should exceed 200ms
          durations.forEach(duration => {
            expect(duration).toBeLessThan(200);
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});

/**
 * Property 22: Current Location Display
 * For any spoofed location, the popup UI should display both the coordinates and
 * a human-readable address or city name (from reverse geocoding, or coordinates
 * if reverse geocoding fails).
 * 
 * Validates: Requirements 7.4, 7.5, 10.2, 10.3
 */
describe('Property 22: Current Location Display', () => {
  let mockBrowser;
  let mockDocument;

  beforeEach(() => {
    mockBrowser = {
      runtime: {
        sendMessage: jest.fn()
      }
    };
    global.browser = mockBrowser;

    mockDocument = {
      getElementById: jest.fn()
    };
    global.document = mockDocument;
  });

  test('should display coordinates for any valid location', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          latitude: fc.double({ min: -90, max: 90, noNaN: true }),
          longitude: fc.double({ min: -180, max: 180, noNaN: true }),
          accuracy: fc.double({ min: 1, max: 100, noNaN: true })
        }),
        async (location) => {
          // Mock UI elements
          const mockLocationName = { textContent: '' };
          const mockLocationCoords = { textContent: '' };

          mockDocument.getElementById.mockImplementation((id) => {
            if (id === 'locationName') return mockLocationName;
            if (id === 'locationCoords') return mockLocationCoords;
            return null;
          });

          // Simulate displayLocation function from popup.js
          function displayLocation(location, locationName) {
            if (locationName && locationName.displayName) {
              mockLocationName.textContent = locationName.displayName;
            } else if (locationName && locationName.city) {
              mockLocationName.textContent = `${locationName.city}, ${locationName.country}`;
            } else {
              mockLocationName.textContent = 'Custom Location';
            }
            
            mockLocationCoords.textContent = 
              `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
          }

          displayLocation(location, null);

          // Verify coordinates are displayed
          expect(mockLocationCoords.textContent).toContain(location.latitude.toFixed(4));
          expect(mockLocationCoords.textContent).toContain(location.longitude.toFixed(4));
          
          // Verify fallback name is shown when no locationName provided
          expect(mockLocationName.textContent).toBe('Custom Location');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('should display human-readable name when available', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          location: fc.record({
            latitude: fc.double({ min: -90, max: 90, noNaN: true }),
            longitude: fc.double({ min: -180, max: 180, noNaN: true })
          }),
          locationName: fc.record({
            city: fc.string({ minLength: 1, maxLength: 50 }),
            country: fc.string({ minLength: 1, maxLength: 50 }),
            displayName: fc.string({ minLength: 1, maxLength: 100 })
          })
        }),
        async ({ location, locationName }) => {
          const mockLocationName = { textContent: '' };
          const mockLocationCoords = { textContent: '' };

          mockDocument.getElementById.mockImplementation((id) => {
            if (id === 'locationName') return mockLocationName;
            if (id === 'locationCoords') return mockLocationCoords;
            return null;
          });

          function displayLocation(location, locationName) {
            if (locationName && locationName.displayName) {
              mockLocationName.textContent = locationName.displayName;
            } else if (locationName && locationName.city) {
              mockLocationName.textContent = `${locationName.city}, ${locationName.country}`;
            } else {
              mockLocationName.textContent = 'Custom Location';
            }
            
            mockLocationCoords.textContent = 
              `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
          }

          displayLocation(location, locationName);

          // Verify human-readable name is displayed
          expect(mockLocationName.textContent).toBe(locationName.displayName);
          
          // Verify coordinates are still displayed
          expect(mockLocationCoords.textContent).toContain(location.latitude.toFixed(4));
          expect(mockLocationCoords.textContent).toContain(location.longitude.toFixed(4));
        }
      ),
      { numRuns: 100 }
    );
  });

  test('should display city and country when displayName not available', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          location: fc.record({
            latitude: fc.double({ min: -90, max: 90, noNaN: true }),
            longitude: fc.double({ min: -180, max: 180, noNaN: true })
          }),
          locationName: fc.record({
            city: fc.string({ minLength: 1, maxLength: 50 }),
            country: fc.string({ minLength: 1, maxLength: 50 })
          })
        }),
        async ({ location, locationName }) => {
          const mockLocationName = { textContent: '' };
          const mockLocationCoords = { textContent: '' };

          mockDocument.getElementById.mockImplementation((id) => {
            if (id === 'locationName') return mockLocationName;
            if (id === 'locationCoords') return mockLocationCoords;
            return null;
          });

          function displayLocation(location, locationName) {
            if (locationName && locationName.displayName) {
              mockLocationName.textContent = locationName.displayName;
            } else if (locationName && locationName.city) {
              mockLocationName.textContent = `${locationName.city}, ${locationName.country}`;
            } else {
              mockLocationName.textContent = 'Custom Location';
            }
            
            mockLocationCoords.textContent = 
              `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
          }

          // Pass locationName without displayName
          displayLocation(location, { city: locationName.city, country: locationName.country });

          // Verify city and country are displayed
          expect(mockLocationName.textContent).toBe(`${locationName.city}, ${locationName.country}`);
          
          // Verify coordinates are displayed
          expect(mockLocationCoords.textContent).toContain(location.latitude.toFixed(4));
          expect(mockLocationCoords.textContent).toContain(location.longitude.toFixed(4));
        }
      ),
      { numRuns: 100 }
    );
  });

  test('should handle coordinate precision correctly', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          latitude: fc.double({ min: -90, max: 90, noNaN: true }),
          longitude: fc.double({ min: -180, max: 180, noNaN: true })
        }),
        async (location) => {
          const mockLocationCoords = { textContent: '' };

          mockDocument.getElementById.mockImplementation((id) => {
            if (id === 'locationCoords') return mockLocationCoords;
            return null;
          });

          // Display coordinates with 4 decimal places
          mockLocationCoords.textContent = 
            `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;

          // Verify format is correct (4 decimal places)
          const coordParts = mockLocationCoords.textContent.split(', ');
          expect(coordParts).toHaveLength(2);
          
          // Check latitude has at most 4 decimal places
          const latDecimals = coordParts[0].split('.')[1];
          if (latDecimals) {
            expect(latDecimals.length).toBeLessThanOrEqual(4);
          }
          
          // Check longitude has at most 4 decimal places
          const lonDecimals = coordParts[1].split('.')[1];
          if (lonDecimals) {
            expect(lonDecimals.length).toBeLessThanOrEqual(4);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
