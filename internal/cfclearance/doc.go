// Package cfclearance is the bounded context that keeps provider egress flowing through a
// Cloudflare managed challenge. Its Transport is the http.RoundTripper every provider client
// passes through: unchallenged traffic is forwarded byte-identical, a challenge is cleared at
// most once per registrable domain at a time through the Solver port, and the clearance
// cookies plus the User-Agent that earned them are kept as one value in the ClearanceStore
// port and replayed on later requests to that domain. A solve that fails, times out or is
// unsupported never surfaces as an error: the original challenge response is the honest
// answer, the domain enters a cooldown, and every step is announced through the Publisher
// port as a clearance.* event that never carries a cookie value.
package cfclearance
