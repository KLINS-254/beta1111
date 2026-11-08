import React, { useEffect, useState } from "react";
import { supabase } from "./supabase";
import {
  Activity, ArrowDownToLine, ArrowUpRight, BarChart3, Bell,
  CheckCircle2, CircleHelp, Clock3, Coins, Copy, Gift, House,
  LogOut, Menu, Megaphone, PlayCircle, ShieldCheck, Smartphone,
  Users, Wallet, X, Zap
} from "lucide-react";

const money = (n, c = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: c,
    maximumFractionDigits: 2
  }).format(Number(n || 0));

const nav = [
  ["Overview", House],
  ["Ad tasks", PlayCircle],
  ["Daily check-in", Gift],
  ["Story tasks", Megaphone],
  ["Referrals", Users],
  ["Wallet", Wallet],
  ["Withdraw", ArrowDownToLine],
  ["Support", CircleHelp]
];

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [page, setPage] = useState("Overview");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [ref, setRef] = useState(
    new URLSearchParams(location.search).get("ref") || ""
  );
  const [mode, setMode] = useState("login");

  const [data, setData] = useState({
    balance: 0,
    activities: [],
    ads: [],
    withdrawals: [],
    referrals: []
  });

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("M-Pesa");
  const [destination, setDestination] = useState("");
  const [storyUrl, setStoryUrl] = useState("");
  const [storyNote, setStoryNote] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [admin, setAdmin] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      load();
    } else {
      setProfile(null);
      setAdmin(false);
    }
  }, [session]);

  async function load() {
    if (!supabase || !session) return;

    const { data: p } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();

    setProfile(p);

    const [
      { data: acts },
      { data: ads },
      { data: wd },
      { data: refs },
      { data: role }
    ] = await Promise.all([
      supabase
        .from("activity_ledger")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(8),

      supabase
        .from("ad_campaigns")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false }),

      supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false }),

      supabase
        .from("profiles")
        .select("id,full_name,created_at")
        .eq("referred_by", session.user.id),

      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle()
    ]);

    setData({
      balance: Number(p?.available_balance || 0),
      activities: acts || [],
      ads: ads || [],
      withdrawals: wd || [],
      referrals: refs || []
    });

    setAdmin(role?.role === "admin");
  }

  async function auth(e) {
    e.preventDefault();
    setBusy(true);
    setNotice("");

    try {
      if (!supabase) {
        throw Error(
          "Add your Supabase URL and anon key to Vercel environment variables first."
        );
      }

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              phone,
              referral_code: ref || null
            }
          }
        });

        if (error) throw error;

        if (data.session) {
          setNotice("Account created successfully.");
        } else {
          setNotice(
            "Check your email to confirm your account, then sign in."
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;
      }
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function checkin() {
    setBusy(true);

    const { error } = await supabase.rpc("claim_daily_checkin");

    setNotice(error?.message || "Daily check-in claimed.");

    await load();
    setBusy(false);
  }

  async function claimAd(ad) {
    setBusy(true);

    const { error } = await supabase.rpc("complete_ad_task", {
      p_ad_id: ad.id
    });

    setNotice(
      error?.message || "Task completed and sent for credit."
    );

    await load();
    setBusy(false);
  }

  async function submitStory(e) {
    e.preventDefault();
    setBusy(true);

    const { error } = await supabase
      .from("story_submissions")
      .insert({
        user_id: session.user.id,
        platform: storyNote,
        url: storyUrl
      });

    setNotice(
      error?.message || "Story submission sent for review."
    );

    setStoryUrl("");
    setStoryNote("");
    setBusy(false);
  }

  async function withdraw(e) {
    e.preventDefault();
    setBusy(true);

    const { error } = await supabase
      .from("withdrawal_requests")
      .insert({
        user_id: session.user.id,
        amount: Number(amount),
        method,
        destination
      });

    setNotice(
      error?.message || "Withdrawal request submitted for admin review."
    );

    setAmount("");
    setDestination("");

    await load();
    setBusy(false);
  }

  async function copyLink() {
    const link = `${location.origin}/?ref=${
      profile?.referral_code || session.user.id.slice(0, 8)
    }`;

    await navigator.clipboard.writeText(link);
    setNotice("Referral link copied.");
  }

  async function logout() {
    await supabase.auth.signOut();
    setPage("Overview");
  }

  if (!session) {
    return (
      <Auth
        mode={mode}
        setMode={setMode}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        name={name}
        setName={setName}
        phone={phone}
        setPhone={setPhone}
        ref={ref}
        setRef={setRef}
        auth={auth}
        busy={busy}
        notice={notice}
      />
    );
  }

  const selected = nav.find((x) => x[0] === page);
  const Icon = selected?.[1] || House;

  return (
    <div className="app">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            ADBETA
            <span>ADS • REWARDS</span>
          </div>
          <button
            className="close-menu"
            onClick={() => setMobileOpen(false)}
          >
            <X />
          </button>
        </div>

        <div className="side-label">WORKSPACE</div>

        {nav.map(([label, I]) => (
          <button
            key={label}
            className={`nav-item ${page === label ? "active" : ""}`}
            onClick={() => {
              setPage(label);
              setMobileOpen(false);
            }}
          >
            <I size={18} />
            {label}
          </button>
        ))}

        {admin && (
          <>
            <div className="side-label">MANAGEMENT</div>
            <button
              className={`nav-item ${page === "Admin" ? "active" : ""}`}
              onClick={() => {
                setPage("Admin");
                setMobileOpen(false);
              }}
            >
              <ShieldCheck size={18} />
              Admin dashboard
            </button>
          </>
        )}

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">
              <CircleHelp />
            </div>
            <b>Need assistance?</b>
            <p>Our support team is here to help.</p>
            <button onClick={() => setPage("Support")}>
              Get support <ArrowUpRight size={14} />
            </button>
          </div>

          <button className="nav-item" onClick={logout}>
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button
            className="menu-btn"
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </button>

          <div className="crumb">
            Workspace <span>/</span> {page}
          </div>

          <div className="top-actions">
            <button className="icon-btn" title="Notifications">
              <Bell size={18} />
            </button>

            <div className="avatar">
              {(profile?.full_name || email || "A")
                .slice(0, 1)
                .toUpperCase()}
            </div>

            <div className="user-label">
              <b>{profile?.full_name || "Member"}</b>
              <span>
                {admin ? "Administrator" : "Member account"}
              </span>
            </div>
          </div>
        </header>

        <section className="content">
          {notice && (
            <div className="notice" onClick={() => setNotice("")}>
              {notice}
              <X size={16} />
            </div>
          )}

          {page === "Overview" && (
            <>
              <div className="welcome">
                <div>
                  <div className="eyebrow">MEMBER OVERVIEW</div>
                  <h1>
                    Welcome back,{" "}
                    {profile?.full_name?.split(" ")[0] || "there"}{" "}
                    <span>✦</span>
                  </h1>
                  <p>
                    Here’s what’s happening with your ADBETA account today.
                  </p>
                </div>

                <div className="date-chip">
                  <Activity size={15} />
                  Your activity hub
                </div>
              </div>

              <div className="stats-grid">
                <Stat
                  icon={Wallet}
                  label="Available balance"
                  value={money(data.balance)}
                  tone="purple"
                />
                <Stat
                  icon={Coins}
                  label="Total earned"
                  value={money(profile?.total_earned)}
                  tone="green"
                />
                <Stat
                  icon={Users}
                  label="Total referrals"
                  value={data.referrals.length}
                  tone="orange"
                />
                <Stat
                  icon={Zap}
                  label="Activities completed"
                  value={data.activities.length}
                  tone="blue"
                />
              </div>

              <div className="section-head">
                <div>
                  <h2>Quick activities</h2>
                  <p>Earn rewards by completing genuine activities.</p>
                </div>

                <button
                  className="text-btn"
                  onClick={() => setPage("Ad tasks")}
                >
                  Explore tasks <ArrowUpRight size={15} />
                </button>
              </div>

              <div className="quick-grid">
                <Quick
                  icon={PlayCircle}
                  title="Watch partner ads"
                  desc="View active advertiser campaigns."
                  action={() => setPage("Ad tasks")}
                />
                <Quick
                  icon={Gift}
                  title="Daily check-in"
                  desc="Claim your daily activity reward."
                  action={checkin}
                />
                <Quick
                  icon={Megaphone}
                  title="Share a story"
                  desc="Submit a public story for review."
                  action={() => setPage("Story tasks")}
                />
                <Quick
                  icon={Users}
                  title="Invite friends"
                  desc="Share your personal referral link."
                  action={() => setPage("Referrals")}
                />
              </div>

              <div className="section-head">
                <div>
                  <h2>Recent activity</h2>
                  <p>Your latest rewards and account movements.</p>
                </div>
              </div>

              <ActivityTable rows={data.activities} />
            </>
          )}

          {page === "Ad tasks" && (
            <>
              <PageTitle
                title="Partner ad tasks"
                sub="Explore active advertiser campaigns. Rewards are credited only after server-side eligibility checks."
              />

              <div className="task-grid">
                {data.ads.map((ad) => (
                  <div className="task-card" key={ad.id}>
                    <div className="task-art">
                      <PlayCircle size={35} />
                      <span>PARTNER CAMPAIGN</span>
                    </div>

                    <div className="task-body">
                      <div className="task-top">
                        <b>{ad.title}</b>
                        <span className="reward">
                          +{money(ad.reward_amount)}
                        </span>
                      </div>

                      <p>
                        {ad.description ||
                          "Watch the partner content and follow the campaign instructions."}
                      </p>

                      <div className="task-foot">
                        <span>
                          <Clock3 size={14} />{" "}
                          {ad.duration_seconds || 15}s view
                        </span>

                        <button
                          className="primary small"
                          onClick={() => claimAd(ad)}
                          disabled={busy}
                        >
                          Complete task
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {!data.ads.length && (
                  <Empty text="No active campaigns right now. Check again later." />
                )}
              </div>
            </>
          )}

          {page === "Daily check-in" && (
            <>
              <PageTitle
                title="Daily check-in"
                sub="Come back each day to claim the current daily reward."
              />

              <div className="feature-panel">
                <div className="feature-symbol">
                  <Gift size={32} />
                </div>

                <div>
                  <div className="eyebrow">DAILY REWARD</div>
                  <h2>One check-in, every day</h2>
                  <p>
                    Rewards and streak rules are controlled by the platform
                    administrator. One claim per account per day.
                  </p>

                  <button
                    className="primary"
                    onClick={checkin}
                    disabled={busy}
                  >
                    Claim today’s check-in
                  </button>
                </div>
              </div>
            </>
          )}

          {page === "Story tasks" && (
            <>
              <PageTitle
                title="Story sharing"
                sub="Share an ADBETA campaign on your social story, then submit its public URL for review."
              />

              <form
                className="form-card narrow"
                onSubmit={submitStory}
              >
                <label>
                  Platform
                  <select
                    value={storyNote}
                    onChange={(e) => setStoryNote(e.target.value)}
                  >
                    <option value="">Choose platform</option>
                    <option>WhatsApp</option>
                    <option>Facebook</option>
                    <option>Instagram</option>
                  </select>
                </label>

                <label>
                  Public story or post URL
                  <input
                    required
                    type="url"
                    placeholder="https://..."
                    value={storyUrl}
                    onChange={(e) => setStoryUrl(e.target.value)}
                  />
                </label>

                <p className="muted">
                  Do not submit private account credentials or altered
                  screenshots. A moderator reviews eligible submissions.
                </p>

                <button
                  className="primary"
                  disabled={busy || !storyNote}
                >
                  Submit for review
                </button>
              </form>
            </>
          )}

          {page === "Referrals" && (
            <>
              <PageTitle
                title="Your referral network"
                sub="Invite people to join for free. Referral rewards apply only under the published programme rules."
              />

              <div className="ref-panel">
                <div>
                  <div className="eyebrow">YOUR INVITE LINK</div>
                  <h2>Grow your community</h2>
                  <p>
                    Share your personal link with friends and track
                    registrations.
                  </p>

                  <div className="copy-row">
                    <code>
                      {location.origin}/?ref=
                      {profile?.referral_code ||
                        session.user.id.slice(0, 8)}
                    </code>

                    <button
                      className="primary small"
                      onClick={copyLink}
                    >
                      <Copy size={15} /> Copy link
                    </button>
                  </div>
                </div>

                <div className="ref-count">
                  <Users size={25} />
                  <strong>{data.referrals.length}</strong>
                  <span>Registered referrals</span>
                </div>
              </div>

              <div className="section-head">
                <div>
                  <h2>Referred members</h2>
                  <p>People who joined using your link.</p>
                </div>
              </div>

              <div className="table-card">
                <table>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Joined</th>
                    </tr>
                  </thead>

                  <tbody>
                    {data.referrals.map((r) => (
                      <tr key={r.id}>
                        <td>{r.full_name || "Member"}</td>
                        <td>
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!data.referrals.length && (
                  <Empty text="No referrals yet." />
                )}
              </div>
            </>
          )}

          {page === "Wallet" && (
            <>
              <PageTitle
                title="My wallet"
                sub="Review your available rewards and account transaction history."
              />

              <div className="wallet-hero">
                <span>AVAILABLE REWARDS</span>
                <strong>{money(data.balance)}</strong>
                <small>
                  Reward credits are funded by eligible advertising activity.
                </small>

                <button
                  className="primary"
                  onClick={() => setPage("Withdraw")}
                >
                  Request withdrawal <ArrowUpRight size={16} />
                </button>
              </div>

              <div className="section-head">
                <div>
                  <h2>Transactions</h2>
                  <p>Recent reward activity.</p>
                </div>
              </div>

              <ActivityTable rows={data.activities} />
            </>
          )}

          {page === "Withdraw" && (
            <>
              <PageTitle
                title="Withdraw rewards"
                sub="Choose M-Pesa or USDT BEP20. Requests are reviewed by the ADBETA payout team."
              />

              <form
                className="form-card narrow"
                onSubmit={withdraw}
              >
                <div className="balance-line">
                  <span>Available balance</span>
                  <b>{money(data.balance)}</b>
                </div>

                <label>
                  Withdrawal method
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    <option>M-Pesa</option>
                    <option>USDT BEP20</option>
                  </select>
                </label>

                <label>
                  Amount (USD equivalent)
                  <input
                    required
                    type="number"
                    min="1"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Enter amount"
                  />
                </label>

                <label>
                  {method === "M-Pesa"
                    ? "M-Pesa phone number"
                    : "USDT BEP20 wallet address"}

                  <input
                    required
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder={
                      method === "M-Pesa"
                        ? "+2547XXXXXXXX"
                        : "0x..."
                    }
                  />
                </label>

                <div className="info-note">
                  Never share your M-Pesa PIN, wallet seed phrase or private
                  key. Submitting a request does not mean payment has been
                  sent. Check the details carefully.
                </div>

                <button className="primary" disabled={busy}>
                  Submit withdrawal request
                </button>
              </form>

              <div className="section-head">
                <div>
                  <h2>Withdrawal requests</h2>
                  <p>Track review and payout status.</p>
                </div>
              </div>

              <div className="table-card">
                <table>
                  <thead>
                    <tr>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>

                  <tbody>
                    {data.withdrawals.map((w) => (
                      <tr key={w.id}>
                        <td>{money(w.amount)}</td>
                        <td>{w.method}</td>
                        <td>
                          <span className={`status ${w.status}`}>
                            {w.status}
                          </span>
                        </td>
                        <td>
                          {new Date(w.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!data.withdrawals.length && (
                  <Empty text="No withdrawal requests yet." />
                )}
              </div>
            </>
          )}

          {page === "Support" && (
            <>
              <PageTitle
                title="Help & support"
                sub="Need help with an activity, account or payout? Contact the support team."
              />

              <div className="quick-grid">
                <Quick
                  icon={CircleHelp}
                  title="Account help"
                  desc="Login, profile and security questions."
                  action={() =>
                    setNotice(
                      "Configure your support email in the project settings."
                    )
                  }
                />

                <Quick
                  icon={Wallet}
                  title="Payment support"
                  desc="Withdrawal and transaction enquiries."
                  action={() =>
                    setNotice(
                      "Please include your request reference when contacting support."
                    )
                  }
                />
              </div>
            </>
          )}

          {page === "Admin" && admin && (
            <AdminPanel setNotice={setNotice} />
          )}
        </section>
      </main>
    </div>
  );
}

function Auth({
  mode, setMode, email, setEmail, password, setPassword,
  name, setName, phone, setPhone, ref, setRef,
  auth, busy, notice
}) {
  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="brand light">
          <div className="brand-mark">A</div>
          <div>
            ADBETA
            <span>ADS • REWARDS</span>
          </div>
        </div>

        <div className="auth-pitch">
          <div className="eyebrow">COMMUNITY & ADVERTISING</div>
          <h1>Earn from the attention you already give.</h1>
          <p>
            Discover partner campaigns, complete activities and track your
            rewards in one place.
          </p>

          <div className="pitch-points">
            <span><CheckCircle2 /> Free registration</span>
            <span><CheckCircle2 /> Transparent activity history</span>
            <span><CheckCircle2 /> M-Pesa & USDT payout requests</span>
          </div>
        </div>

        <div className="auth-foot">
          ADBETA · A community rewards platform
        </div>
      </div>

      <div className="auth-right">
        <form className="auth-form" onSubmit={auth}>
          <div className="eyebrow">
            {mode === "login" ? "WELCOME BACK" : "GET STARTED"}
          </div>

          <h2>
            {mode === "login"
              ? "Sign in to ADBETA"
              : "Create your account"}
          </h2>

          <p>
            {mode === "login"
              ? "Enter your details to continue."
              : "Join for free and start exploring available activities."}
          </p>

          {mode === "signup" && (
            <>
              <label>
                Full name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                />
              </label>

              <label>
                Mobile number
                <input
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+254 7XX XXX XXX"
                />
              </label>

              <label>
                Referral code (optional)
                <input
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="Referral code"
                />
              </label>
            </>
          )}

          <label>
            Email address
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>

          <label>
            Password
            <input
              required
              minLength="8"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </label>

          {notice && <div className="notice">{notice}</div>}

          <button className="primary full" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create free account"}
          </button>

          <div className="switch-auth">
            {mode === "login"
              ? "New to ADBETA?"
              : "Already have an account?"}{" "}

            <button
              type="button"
              onClick={() =>
                setMode(mode === "login" ? "signup" : "login")
              }
            >
              {mode === "login" ? "Create account" : "Sign in"}
            </button>
          </div>

          <small className="legal">
            By continuing, you agree to the ADBETA Terms and Privacy Policy.
            You must be at least 18 and comply with local laws.
          </small>
        </form>
      </div>
    </div>
  );
}

function Stat({ icon: I, label, value, tone }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <I size={20} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>Account summary</small>
    </div>
  );
}

function Quick({ icon: I, title, desc, action }) {
  return (
    <button className="quick-card" onClick={action}>
      <div className="quick-icon">
        <I size={21} />
      </div>
      <div>
        <b>{title}</b>
        <p>{desc}</p>
      </div>
      <ArrowUpRight className="quick-arrow" size={17} />
    </button>
  );
}

function PageTitle({ title, sub }) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">ADBETA WORKSPACE</div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
    </div>
  );
}

function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

function ActivityTable({ rows }) {
  return (
    <div className="table-card">
      <table>
        <thead>
          <tr>
            <th>Activity</th>
            <th>Reward</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.description || r.activity_type}</td>
              <td className="positive">+{money(r.amount)}</td>
              <td>
                <span className={`status ${r.status || "approved"}`}>
                  {r.status || "approved"}
                </span>
              </td>
              <td>
                {new Date(r.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!rows.length && (
        <Empty text="Your activity history will appear here." />
      )}
    </div>
  );
}

function AdminPanel({ setNotice }) {
  const [tab, setTab] = useState("Withdrawals");
  const [withdrawals, setWithdrawals] = useState([]);
  const [ads, setAds] = useState([]);
  const [stories, setStories] = useState([]);
  const [members, setMembers] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reward, setReward] = useState("0.05");

  async function refresh() {
    const [
      { data: w },
      { data: a },
      { data: s },
      { data: m }
    ] = await Promise.all([
      supabase
        .from("withdrawal_requests")
        .select("*")
        .order("created_at", { ascending: false }),

      supabase
        .from("ad_campaigns")
        .select("*")
        .order("created_at", { ascending: false }),

      supabase
        .from("story_submissions")
        .select("*")
        .order("created_at", { ascending: false }),

      supabase
        .from("profiles")
        .select(
          "id,full_name,phone,available_balance,total_earned,created_at"
        )
        .order("created_at", { ascending: false })
        .limit(200)
    ]);

    setWithdrawals(w || []);
    setAds(a || []);
    setStories(s || []);
    setMembers(m || []);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function status(id, next) {
    const { error } = await supabase.rpc(
      "admin_review_withdrawal",
      {
        p_request_id: id,
        p_status: next
      }
    );

    setNotice(error?.message || `Withdrawal marked ${next}.`);
    refresh();
  }

  async function reviewStory(id, next) {
    const { error } = await supabase
      .from("story_submissions")
      .update({ status: next })
      .eq("id", id);

    setNotice(
      error?.message || `Story submission ${next}.`
    );

    refresh();
  }

  async function addAd(e) {
    e.preventDefault();

    const { error } = await supabase
      .from("ad_campaigns")
      .insert({
        title,
        description,
        reward_amount: Number(reward),
        active: true
      });

    setNotice(error?.message || "Campaign created.");
    setTitle("");
    setDescription("");
    refresh();
  }

  const tabs = [
    "Withdrawals",
    "Campaigns",
    "Story reviews",
    "Members"
  ];

  return (
    <>
      <PageTitle
        title="Admin dashboard"
        sub="Manage payout requests, campaigns, story submissions and member accounts."
      />

      <div className="admin-tabs">
        {tabs.map((t) => (
          <button
            key={t}
            className={tab === t ? "chosen" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Withdrawals" && (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Member ID</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Destination</th>
                <th>Status / actions</th>
              </tr>
            </thead>

            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id}>
                  <td>{w.user_id.slice(0, 8)}…</td>
                  <td>{money(w.amount)}</td>
                  <td>{w.method}</td>
                  <td>{w.destination}</td>
                  <td>
                    <span className={`status ${w.status}`}>
                      {w.status}
                    </span>{" "}

                    {w.status === "pending" && (
                      <>
                        <button
                          className="approve"
                          onClick={() => status(w.id, "approved")}
                        >
                          Approve
                        </button>{" "}

                        <button
                          className="reject"
                          onClick={() => status(w.id, "rejected")}
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {w.status === "approved" && (
                      <button
                        className="approve"
                        onClick={() => status(w.id, "paid")}
                      >
                        Mark paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!withdrawals.length && (
            <Empty text="No withdrawal requests." />
          )}
        </div>
      )}

      {tab === "Campaigns" && (
        <>
          <form
            className="form-card narrow"
            onSubmit={addAd}
          >
            <h3>Create advertiser campaign</h3>

            <label>
              Campaign title
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>

            <label>
              Description
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>

            <label>
              Reward (USD)
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={reward}
                onChange={(e) => setReward(e.target.value)}
              />
            </label>

            <button className="primary">
              Publish campaign
            </button>
          </form>

          <div className="table-card" style={{ marginTop: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Reward</th>
                  <th>Active</th>
                </tr>
              </thead>

              <tbody>
                {ads.map((a) => (
                  <tr key={a.id}>
                    <td>{a.title}</td>
                    <td>{money(a.reward_amount)}</td>
                    <td>{String(a.active)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "Story reviews" && (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Platform</th>
                <th>Submission</th>
                <th>Status / actions</th>
              </tr>
            </thead>

            <tbody>
              {stories.map((s) => (
                <tr key={s.id}>
                  <td>{s.user_id.slice(0, 8)}…</td>
                  <td>{s.platform}</td>
                  <td>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open submission
                    </a>
                  </td>
                  <td>
                    <span className={`status ${s.status}`}>
                      {s.status}
                    </span>{" "}

                    {s.status === "pending" && (
                      <>
                        <button
                          className="approve"
                          onClick={() => reviewStory(s.id, "approved")}
                        >
                          Approve
                        </button>{" "}

                        <button
                          className="reject"
                          onClick={() => reviewStory(s.id, "rejected")}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!stories.length && (
            <Empty text="No story submissions." />
          )}
        </div>
      )}

      {tab === "Members" && (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Phone</th>
                <th>Balance</th>
                <th>Total earned</th>
                <th>Joined</th>
              </tr>
            </thead>

            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.full_name || m.id.slice(0, 8)}</td>
                  <td>{m.phone || "—"}</td>
                  <td>{money(m.available_balance)}</td>
                  <td>{money(m.total_earned)}</td>
                  <td>
                    {new Date(m.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!members.length && (
            <Empty text="No members found." />
          )}
        </div>
      )}
    </>
  );
}

export default App;
