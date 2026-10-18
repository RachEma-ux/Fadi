"""Pure endpoint validation; importing this module performs no provisioning or IO."""
from urllib.parse import urlsplit, unquote


def validate_database_url(raw, manifest):
    """Refuse silently inherited, ambiguous or mismatched database endpoints."""
    try:
        if not isinstance(raw, str) or not raw or any(c.isspace() or ord(c) < 32 for c in raw):
            raise ValueError()
        target = urlsplit(raw)
        if (target.scheme not in ('postgresql', 'postgres')
                or target.hostname != '127.0.0.1'
                or manifest['host'] != '127.0.0.1'
                or target.port != manifest['port']
                or target.path != '/' + manifest['database']
                or unquote(target.username or '') != 'studio_app'
                or manifest['role'] != 'studio_app'
                or not unquote(target.password or '')
                or target.query or target.fragment
                or '?' in raw or '#' in raw or '\\' in raw):
            raise ValueError()
    except (ValueError, TypeError, KeyError):
        raise ValueError('Disposable database endpoint refused') from None
    return raw
