/*-
 * Public Domain 2014-present MongoDB, Inc.
 * Public Domain 2008-2014 WiredTiger, Inc.
 *
 * This is free and unencumbered software released into the public domain.
 *
 * Anyone is free to copy, modify, publish, use, compile, sell, or
 * distribute this software, either in source code form or as a compiled
 * binary, for any purpose, commercial or non-commercial, and by any
 * means.
 *
 * In jurisdictions that recognize copyright laws, the author or authors
 * of this software dedicate any and all copyright interest in the
 * software to the public domain. We make this dedication for the benefit
 * of the public at large and to the detriment of our heirs and
 * successors. We intend this dedication to be an overt act of
 * relinquishment in perpetuity of all present and future rights to this
 * software under copyright law.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
 * OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
 * ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */

namespace test_harness {

class scoped_cursor {
    public:
    scoped_cursor() = default;
    scoped_cursor(WT_SESSION *session, const char *uri, const char *cfg)
    {
        reinit(session, uri, cfg);
    }

    virtual ~scoped_cursor()
    {
        if (_cursor != nullptr)
            testutil_check(_cursor->close(_cursor));
    }

    /* Moving is ok but copying is not. */
    scoped_cursor(scoped_cursor &&other)
    {
        std::swap(_cursor, other._cursor);
    }

    /*
     * Implement move assignment by move constructing a temporary and swapping its internals with
     * the current cursor. This means that the currently held WT_CURSOR will get destroyed as the
     * temporary falls out of the scope and we will steal the one that we're move assigning from.
     */
    scoped_cursor &
    operator=(scoped_cursor &&other)
    {
        scoped_cursor tmp(std::move(other));
        std::swap(_cursor, tmp._cursor);
        return (*this);
    }

    scoped_cursor(const scoped_cursor &) = delete;
    scoped_cursor &operator=(const scoped_cursor &) = delete;

    void
    reinit(WT_SESSION *session, const char *uri, const char *cfg)
    {
        if (_cursor != nullptr) {
            testutil_check(_cursor->close(_cursor));
            _cursor = nullptr;
        }
        if (session != nullptr)
            testutil_check(session->open_cursor(session, uri, nullptr, cfg, &_cursor));
    }

    /*
     * Override the dereference operators. The idea is that we should able to use this class as if
     * it is a pointer to a WT_CURSOR.
     */
    WT_CURSOR &
    operator*()
    {
        return (*_cursor);
    }

    WT_CURSOR *
    operator->()
    {
        return (_cursor);
    }

    WT_CURSOR *
    get()
    {
        return (_cursor);
    }

    private:
    WT_CURSOR *_cursor = nullptr;
};

class scoped_session {
    public:
    scoped_session() = default;
    explicit scoped_session(WT_CONNECTION *conn)
    {
        reinit(conn);
    }

    virtual ~scoped_session()
    {
        if (_session != nullptr)
            testutil_check(_session->close(_session, nullptr));
    }

    /* Moving is ok but copying is not. */
    scoped_session(scoped_session &&other)
    {
        std::swap(_session, other._session);
    }

    /*
     * Implement move assignment by move constructing a temporary and swapping its internals with
     * the current session. This means that the currently held WT_SESSION will get destroyed as the
     * temporary falls out of the scope and we will steal the one that we're move assigning from.
     */
    scoped_session &
    operator=(scoped_session &&other)
    {
        scoped_session tmp(std::move(other));
        std::swap(_session, tmp._session);
        return (*this);
    }

    scoped_session(const scoped_session &) = delete;
    scoped_session &operator=(const scoped_session &) = delete;

    void
    reinit(WT_CONNECTION *conn)
    {
        if (_session != nullptr) {
            testutil_check(_session->close(_session, nullptr));
            _session = nullptr;
        }
        if (conn != nullptr)
            testutil_check(conn->open_session(conn, nullptr, nullptr, &_session));
    }

    /*
     * Override the dereference operators. The idea is that we should able to use this class as if
     * it is a pointer to a WT_SESSION.
     */
    WT_SESSION &
    operator*()
    {
        return (*_session);
    }

    WT_SESSION *
    operator->()
    {
        return (_session);
    }

    WT_SESSION *
    get()
    {
        return (_session);
    }

    scoped_cursor
    open_scoped_cursor(const char *uri, const char *cfg = nullptr)
    {
        return (scoped_cursor(_session, uri, cfg));
    }

    private:
    WT_SESSION *_session = nullptr;
};

} // namespace test_harness
