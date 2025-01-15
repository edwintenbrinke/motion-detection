class CookieHelper {
    // Get a cookie value by name
    static getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    // Set a cookie with a name, value, and optional expiration days
    static setCookie(name, value, days) {
        let expires = "";
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
            expires = `; expires=${date.toUTCString()}`;
        }
        document.cookie = `${name}=${value || ""}${expires}; path=/`;
    }

    // Delete a cookie by name
    static deleteCookie(name) {
        document.cookie = `${name}=; Max-Age=-99999999; path=/`;
    }

    // Check if a cookie exists
    static hasCookie(name) {
        return this.getCookie(name) !== null;
    }
}

export default CookieHelper;