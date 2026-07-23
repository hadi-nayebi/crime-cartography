# Crime Cartography VPS templates

These files document a minimal single-VPS deployment. They are examples only;
paths, user IDs, firewall rules, OAuth storage, retention, and monitoring must
be reviewed before use.

The service runs the read-only mailbox summary command. It does not send email,
write a subscriber database, publish a video, or expose a public API.

Keep the checkout in a private directory, place the Gmail refresh token in an
operator-owned secret path outside Git, and run the service as a dedicated
non-root account. The public website can remain static on its existing host.
