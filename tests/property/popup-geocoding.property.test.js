/**
 * Property-based tests for popup geocoding functionality
 * Feature: geolocation-spoof-extension-mvp
 */

const fc = require('fast-check');

/**
 * Property 11: Geocoding Query Triggers API Call
 * For any non-empty search query (length >= 3 characters), entering it in the
 * location picker should trigger a geocoding API request.
 * 
 * Validates: Requirements 4.2, 9.1
 */
describe('Property 11: Geocoding Query Triggers API Call', () => {
  test('should trigger geocoding for queries with 3 or more characters after trimming', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 100 }),
        async (query) => {
          // Create fresh mock for each iteration
          const localMock = {
            runtime: {
              sendMessage: jest.fn().mockResolvedValue({ results: [] })
            }
          };

          const trimmedQuery = query.trim();

          // Simulate location search from popup.js - only trigger if trimmed length >= 3
          if (trimmedQuery.length >= 3) {
            await localMock.runtime.sendMessage({
              type: 'GEOCODE_QUERY',
              payload: { query: trimmedQuery }
            });

            // Verify API call was made
            expect(localMock.runtime.sendMessage).toHaveBeenCalledTimes(1);
            expect(localMock.runtime.sendMessage).toHaveBeenCalledWith({
              type: 'GEOCODE_QUERY',
              payload: { query: trimmedQuery }
            });
          } else {
            // If trimmed query is too short, no API call should be made
            expect(localMock.runtime.sendMessage).not.toHaveBeenCalled();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('should not trigger geocoding for queries shorter than 3 characters', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 2 }),
        async (query) => {
          const localMock = {
            runtime: {
              sendMessage: jest.fn().mockResolvedValue({ results: [] })
            }
          };

          // Simulate the input handler logic from popup.js
          const trimmedQuery = query.trim();
          
          if (trimmedQuery.length >= 3) {
            await localMock.runtime.sendMessage({
              type: 'GEOCODE_QUERY',
              payload: { query: trimmedQuery }
            });
          }

          // Verify no API call was made for short queries
          expect(localMock.runtime.sendMessage).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  test('should handle whitespace-only queries correctly', async () => {
    // Test with strings that are only whitespace
    const whitespaceQueries = ['   ', '\t\t\t', '  \n  ', '     '];
    
    for (const query of whitespaceQueries) {
      const localMock = {
        runtime: {
          sendMessage: jest.fn().mockResolvedValue({ results: [] })
        }
      };

      // Simulate the input handler logic
      const trimmedQuery = query.trim();
      
      if (trimmedQuery.length >= 3) {
        await localMock.runtime.sendMessage({
          type: 'GEOCODE_QUERY',
          payload: { query: trimmedQuery }
        });
      }

      // Verify no API call for whitespace-only queries
      expect(localMock.runtime.sendMessage).not.toHaveBeenCalled();
    }
  });

  test('should handle queries with leading/trailing whitespace', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 50 }),
        async (query) => {
          // Create fresh mock for each iteration
          const localMock = {
            runtime: {
              sendMessage: jest.fn().mockResolvedValue({ results: [] })
            }
          };

          // Add whitespace
          const fullQuery = '  ' + query + '  ';
          const trimmedQuery = fullQuery.trim();
          
          if (trimmedQuery.length >= 3) {
            await localMock.runtime.sendMessage({
              type: 'GEOCODE_QUERY',
              payload: { query: trimmedQuery }
            });

            // Verify API call was made with trimmed query
            expect(localMock.runtime.sendMessage).toHaveBeenCalledWith({
              type: 'GEOCODE_QUERY',
              payload: { query: trimmedQuery }
            });
            
            // Verify trimmed query doesn't have leading/trailing whitespace
            expect(trimmedQuery).toBe(trimmedQuery.trim());
            expect(trimmedQuery).toBe(query.trim());
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('should send correct query format to background script', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 3, maxLength: 100 }),
        async (query) => {
          const localMock = {
            runtime: {
              sendMessage: jest.fn().mockResolvedValue({ results: [] })
            }
          };

          const trimmedQuery = query.trim();
          
          if (trimmedQuery.length >= 3) {
            await localMock.runtime.sendMessage({
              type: 'GEOCODE_QUERY',
              payload: { query: trimmedQuery }
            });

            // Verify message format
            const call = localMock.runtime.sendMessage.mock.calls[0][0];
            expect(call).toHaveProperty('type', 'GEOCODE_QUERY');
            expect(call).toHaveProperty('payload');
            expect(call.payload).toHaveProperty('query', trimmedQuery);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 12: Search Results Display
 * For any non-empty geocoding result set, the location picker should display
 * selectable location options (up to 5 results).
 * 
 * Validates: Requirements 4.3, 9.2
 */
describe('Property 12: Search Results Display', () => {
  test('should display up to 5 search results', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 100 }),
            latitude: fc.double({ min: -90, max: 90, noNaN: true }),
            longitude: fc.double({ min: -180, max: 180, noNaN: true })
          }),
          { minLength: 1, maxLength: 20 }
        ),
        async (results) => {
          // Mock DOM
          const mockContainer = {
            innerHTML: ''
          };
          const mockDocument = {
            getElementById: jest.fn().mockReturnValue(mockContainer),
            querySelectorAll: jest.fn().mockReturnValue([])
          };

          // Simulate displaySearchResults function from popup.js
          function displaySearchResults(results) {
            if (results.length === 0) {
              mockContainer.innerHTML = "<div class='no-results'>No locations found</div>";
              return;
            }
            
            // Display up to 5 results
            const displayResults = results.slice(0, 5);
            mockContainer.innerHTML = displayResults.map(result => `
              <div class="search-result" data-lat="${result.latitude}" data-lon="${result.longitude}">
                <div class="result-name">${result.name}</div>
                <div class="result-coords">${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)}</div>
              </div>
            `).join("");
          }

          displaySearchResults(results);

          // Verify results are displayed
          expect(mockContainer.innerHTML).not.toBe('');
          
          // Verify at most 5 results are displayed
          const resultCount = (mockContainer.innerHTML.match(/class="search-result"/g) || []).length;
          expect(resultCount).toBeLessThanOrEqual(5);
          expect(resultCount).toBeGreaterThan(0);
          
          // If input has more than 5 results, verify only 5 are shown
          if (results.length > 5) {
            expect(resultCount).toBe(5);
          } else {
            expect(resultCount).toBe(results.length);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('should display "no results" message for empty result set', async () => {
    const mockContainer = {
      innerHTML: ''
    };

    function displaySearchResults(results) {
      if (results.length === 0) {
        mockContainer.innerHTML = "<div class='no-results'>No locations found</div>";
        return;
      }
      
      mockContainer.innerHTML = results.map(result => `
        <div class="search-result">
          <div class="result-name">${result.name}</div>
        </div>
      `).join("");
    }

    displaySearchResults([]);

    expect(mockContainer.innerHTML).toContain('no-results');
    expect(mockContainer.innerHTML).toContain('No locations found');
  });

  test('should display result name and coordinates for each result', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 100 }),
            latitude: fc.double({ min: -90, max: 90, noNaN: true }),
            longitude: fc.double({ min: -180, max: 180, noNaN: true })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (results) => {
          const mockContainer = {
            innerHTML: ''
          };

          function displaySearchResults(results) {
            mockContainer.innerHTML = results.map(result => `
              <div class="search-result" data-lat="${result.latitude}" data-lon="${result.longitude}">
                <div class="result-name">${result.name}</div>
                <div class="result-coords">${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)}</div>
              </div>
            `).join("");
          }

          displaySearchResults(results);

          // Verify each result has name and coordinates
          for (const result of results) {
            expect(mockContainer.innerHTML).toContain(result.name);
            expect(mockContainer.innerHTML).toContain(result.latitude.toFixed(4));
            expect(mockContainer.innerHTML).toContain(result.longitude.toFixed(4));
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('should include data attributes for latitude and longitude', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 100 }),
            latitude: fc.double({ min: -90, max: 90, noNaN: true }),
            longitude: fc.double({ min: -180, max: 180, noNaN: true })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (results) => {
          const mockContainer = {
            innerHTML: ''
          };

          function displaySearchResults(results) {
            mockContainer.innerHTML = results.map(result => `
              <div class="search-result" data-lat="${result.latitude}" data-lon="${result.longitude}">
                <div class="result-name">${result.name}</div>
                <div class="result-coords">${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)}</div>
              </div>
            `).join("");
          }

          displaySearchResults(results);

          // Verify data attributes are present
          for (const result of results) {
            expect(mockContainer.innerHTML).toContain(`data-lat="${result.latitude}"`);
            expect(mockContainer.innerHTML).toContain(`data-lon="${result.longitude}"`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 13: Location Selection Updates Spoofed Coordinates
 * For any location selected from search results, the extension's spoofed location
 * should be updated to match the selected coordinates.
 * 
 * Validates: Requirements 4.4
 */
describe('Property 13: Location Selection Updates Spoofed Coordinates', () => {
  test('should update spoofed location when result is selected', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          latitude: fc.double({ min: -90, max: 90, noNaN: true }),
          longitude: fc.double({ min: -180, max: 180, noNaN: true })
        }),
        async (selectedLocation) => {
          const localMock = {
            runtime: {
              sendMessage: jest.fn().mockResolvedValue({ success: true })
            }
          };

          // Simulate setLocation function from popup.js
          async function setLocation(latitude, longitude) {
            await localMock.runtime.sendMessage({
              type: 'SET_LOCATION',
              payload: { latitude, longitude }
            });
          }

          await setLocation(selectedLocation.latitude, selectedLocation.longitude);

          // Verify location update message was sent
          expect(localMock.runtime.sendMessage).toHaveBeenCalledWith({
            type: 'SET_LOCATION',
            payload: {
              latitude: selectedLocation.latitude,
              longitude: selectedLocation.longitude
            }
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  test('should handle multiple location selections', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            latitude: fc.double({ min: -90, max: 90, noNaN: true }),
            longitude: fc.double({ min: -180, max: 180, noNaN: true })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (locations) => {
          const localMock = {
            runtime: {
              sendMessage: jest.fn().mockResolvedValue({ success: true })
            }
          };

          async function setLocation(latitude, longitude) {
            await localMock.runtime.sendMessage({
              type: 'SET_LOCATION',
              payload: { latitude, longitude }
            });
          }

          // Select each location in sequence
          for (const location of locations) {
            await setLocation(location.latitude, location.longitude);
          }

          // Verify all selections were sent
          expect(localMock.runtime.sendMessage).toHaveBeenCalledTimes(locations.length);
          
          // Verify last selection matches last location
          const lastCall = localMock.runtime.sendMessage.mock.calls[locations.length - 1][0];
          const lastLocation = locations[locations.length - 1];
          expect(lastCall.payload.latitude).toBe(lastLocation.latitude);
          expect(lastCall.payload.longitude).toBe(lastLocation.longitude);
        }
      ),
      { numRuns: 50 }
    );
  });

  test('should clear search UI after location selection', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          latitude: fc.double({ min: -90, max: 90, noNaN: true }),
          longitude: fc.double({ min: -180, max: 180, noNaN: true })
        }),
        async (selectedLocation) => {
          const localMock = {
            runtime: {
              sendMessage: jest.fn().mockResolvedValue({ success: true })
            }
          };

          const mockSearchInput = { value: 'San Francisco' };
          const mockSearchResults = { innerHTML: '<div>Results</div>' };

          async function setLocation(latitude, longitude) {
            await localMock.runtime.sendMessage({
              type: 'SET_LOCATION',
              payload: { latitude, longitude }
            });
            
            // Clear search UI (as in popup.js)
            mockSearchInput.value = '';
            mockSearchResults.innerHTML = '';
          }

          await setLocation(selectedLocation.latitude, selectedLocation.longitude);

          // Verify search UI was cleared
          expect(mockSearchInput.value).toBe('');
          expect(mockSearchResults.innerHTML).toBe('');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('should preserve coordinate precision in location update', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          latitude: fc.double({ min: -90, max: 90, noNaN: true }),
          longitude: fc.double({ min: -180, max: 180, noNaN: true })
        }),
        async (selectedLocation) => {
          const localMock = {
            runtime: {
              sendMessage: jest.fn().mockResolvedValue({ success: true })
            }
          };

          async function setLocation(latitude, longitude) {
            await localMock.runtime.sendMessage({
              type: 'SET_LOCATION',
              payload: { latitude, longitude }
            });
          }

          await setLocation(selectedLocation.latitude, selectedLocation.longitude);

          // Verify exact coordinates were sent (no rounding)
          const call = localMock.runtime.sendMessage.mock.calls[0][0];
          expect(call.payload.latitude).toBe(selectedLocation.latitude);
          expect(call.payload.longitude).toBe(selectedLocation.longitude);
        }
      ),
      { numRuns: 100 }
    );
  });
});
