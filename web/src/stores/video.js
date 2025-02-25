import { defineStore } from 'pinia';
import dayjs from 'dayjs';

export const useVideoStore = defineStore('video', {
    state: () => ({
        hourlyVideosByDate: {}, // Stores hourly data in format: {YYYY-MM-DD: {hour: videos[]}}
        dailyVideosByDate: {}, // Stores daily hour summary in format: {YYYY-MM-DD: hourSummary[]}
        lastFetchTimes: {}, // Track when data was last fetched: {YYYY-MM-DD: ISOString, YYYY-MM-DD-HH: ISOString}
        selectedVideoId: null,
        importanceFilter: false, // Current filter state
    }),

    getters: {
        getDailyHoursForDate: (state) => (date, showImportantOnly = false) => {
            const dateKey = dayjs(date).format('YYYY-MM-DD');
            const filterKey = showImportantOnly ? `${dateKey}-important` : dateKey;
            return state.dailyVideosByDate[filterKey] || [];
        },

        getVideosForHour: (state) => (date, hour, showImportantOnly = false) => {
            const dateKey = dayjs(date).format('YYYY-MM-DD');
            const hourKey = `${dateKey}-${hour}`;
            const filterKey = showImportantOnly ? `${hourKey}-important` : hourKey;
            return state.hourlyVideosByDate[filterKey] || [];
        },

        getLastFetchTimeForDate: (state) => (date, showImportantOnly = false) => {
            const dateKey = dayjs(date).format('YYYY-MM-DD');
            const filterKey = showImportantOnly ? `${dateKey}-important` : dateKey;
            return state.lastFetchTimes[filterKey] || null;
        },

        getLastFetchTimeForHour: (state) => (date, hour, showImportantOnly = false) => {
            const dateKey = dayjs(date).format('YYYY-MM-DD');
            const hourKey = `${dateKey}-${hour}`;
            const filterKey = showImportantOnly ? `${hourKey}-important` : hourKey;
            return state.lastFetchTimes[filterKey] || null;
        },

        shouldRefreshDailyData: (state) => (date, showImportantOnly = false) => {
            const dateKey = dayjs(date).format('YYYY-MM-DD');
            const filterKey = showImportantOnly ? `${dateKey}-important` : dateKey;
            const lastFetch = state.lastFetchTimes[filterKey];
            const now = dayjs();
            const requestedDate = dayjs(date);

            // Case 1: No data yet - always refresh
            if (!lastFetch) {
                return true;
            }

            // Case 2: For today, refresh if last fetch was more than 1 minute ago
            if (requestedDate.isSame(now, 'day')) {
                return dayjs().diff(dayjs(lastFetch), 'minute') > 1;
            }

            // Case 3: Yesterday's data - check if we're viewing it on a newer day
            // and if the last fetch was not at the end of the day
            if (requestedDate.isBefore(now, 'day')) {
                const lastFetchTime = dayjs(lastFetch);
                const lastFetchDate = lastFetchTime.startOf('day');

                // If we fetched yesterday's data yesterday
                if (lastFetchDate.isSame(requestedDate, 'day')) {
                    // Check if the current day is different (we're viewing yesterday's data today)
                    // AND our last fetch was before midnight
                    const endOfRequestedDay = requestedDate.endOf('day');

                    // If we fetched before the end of the day, there might be new data
                    if (lastFetchTime.isBefore(endOfRequestedDay)) {
                        return true;
                    }
                }
            }

            // Default: No need to refresh
            return false;
        },

        // Calculate the since parameter for API fetch to make it more efficient
        getSinceParameterForDate: (state) => (date, showImportantOnly = false) => {
            const dateKey = dayjs(date).format('YYYY-MM-DD');
            const filterKey = showImportantOnly ? `${dateKey}-important` : dateKey;
            const lastFetch = state.lastFetchTimes[filterKey];

            // If we have previous data, start from last fetch time to get only new data
            if (lastFetch) {
                return lastFetch;
            }

            // If no previous data, start from beginning of the day
            return dayjs(date).startOf('day').toISOString();
        },

        shouldRefreshHourlyData: (state) => (date, hour, showImportantOnly = false) => {
            const dateKey = dayjs(date).format('YYYY-MM-DD');
            const hourKey = `${dateKey}-${hour}`;
            const filterKey = showImportantOnly ? `${hourKey}-important` : hourKey;
            const lastFetch = state.lastFetchTimes[filterKey];

            if (!lastFetch) {
                // If we've never fetched this data, we should definitely fetch it
                return true;
            }

            const lastFetchTime = dayjs(lastFetch);
            const requestedDateTime = dayjs(date).hour(parseInt(hour));
            const now = dayjs();

            // Case 1: Current hour of today - refresh if last fetch was more than 1 minute ago
            if (requestedDateTime.isSame(now, 'hour') && requestedDateTime.isSame(now, 'day')) {
                return now.diff(lastFetchTime, 'minute') > 1;
            }

            // Case 2: Historical hour that's already passed and complete
            // If the requested hour is in the past and at least one full hour has passed since that hour ended
            if (requestedDateTime.isBefore(now, 'hour')) {
                // Check if we fetched this hour's data AFTER the hour was fully completed
                // Hour is fully completed when the next hour starts
                const hourEndTime = requestedDateTime.add(1, 'hour');

                // If we fetched after the hour was complete, no need to refresh
                if (lastFetchTime.isAfter(hourEndTime)) {
                    return false;
                }

                // If we fetched during the hour, we should refresh to get complete data
                return true;
            }

            // Case 3: Future hour (shouldn't happen normally, but just in case)
            if (requestedDateTime.isAfter(now, 'hour')) {
                return false; // No point refreshing future data
            }

            // Default case: refresh if unsure
            return true;
        },

        // Calculate the since parameter for hourly API fetch
        getSinceParameterForHour: (state) => (date, hour, showImportantOnly = false) => {
            const dateKey = dayjs(date).format('YYYY-MM-DD');
            const hourKey = `${dateKey}-${hour}`;
            const filterKey = showImportantOnly ? `${hourKey}-important` : hourKey;
            const lastFetch = state.lastFetchTimes[filterKey];

            // If we have previous data, start from last fetch time
            if (lastFetch) {
                return lastFetch;
            }

            // If no previous data, start from beginning of the hour
            return dayjs(date).hour(parseInt(hour)).minute(0).second(0).toISOString();
        }
    },

    actions: {
        setDailyHoursForDate(date, hourSummaries, showImportantOnly = false) {
            const dateKey = dayjs(date).format('YYYY-MM-DD');
            const filterKey = showImportantOnly ? `${dateKey}-important` : dateKey;

            this.dailyVideosByDate[filterKey] = hourSummaries;
            this.lastFetchTimes[filterKey] = dayjs().toISOString();
        },

        setVideosForHour(date, hour, videos, showImportantOnly = false) {
            const dateKey = dayjs(date).format('YYYY-MM-DD');
            const hourKey = `${dateKey}-${hour}`;
            const filterKey = showImportantOnly ? `${hourKey}-important` : hourKey;

            this.hourlyVideosByDate[filterKey] = videos;
            this.lastFetchTimes[filterKey] = dayjs().toISOString();
        },

        setImportanceFilter(showImportantOnly) {
            this.importanceFilter = showImportantOnly;
        },

        selectVideo(videoId) {
            this.selectedVideoId = videoId;
        },

        clearSelectedVideo() {
            this.selectedVideoId = null;
        }
    },

    // Enable persistence of the store in localStorage
    persist: {
        enabled: true,
        strategies: [
            {
                key: 'motion-detection-store',
                storage: localStorage,
            },
        ],
    },
});