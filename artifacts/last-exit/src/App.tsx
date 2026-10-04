import { useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  useAcceptFriendRequest, useAcceptPartyInvitation, useBlockPlayer, useCreateParty,
  useCreateGuest, useDeclineFriendRequest, useDeclinePartyInvitation, useGetBlockedPlayers,
  useGetCurrentParty, useGetCurrentUser, useGetFriendRequests, useGetFriends,
  useGetLobbySummary, useGetPartyInvitations, useInviteToParty, useJoinParty,
  useLeaveParty, useLoginUser, useLogoutUser, useRegisterUser, useRemoveFriend,
  useSendFriendRequest, useSetPartyMode, useSetPartyReady, useSetPartyTeam,
  useStartParty, useUnblockPlayer,
  getGetBlockedPlayersQueryKey, getGetCurrentPartyQueryKey, getGetCurrentUserQueryKey,
  getGetFriendRequestsQueryKey, getGetFriendsQueryKey, getGetLobbySummaryQueryKey,
  getGetPartyInvitationsQueryKey,
  type Friend, type Party, type PartyMember, type PartyMode, type Player,
} from '@workspace/api-client-react';
import {
  ArrowDownRight, ArrowLeft, ArrowRight, Check, ChevronDown, Copy,
  DoorOpen, Film, Gamepad2, LockKeyhole, LogOut, Plus, Radio, Shield,
  Skull, UserPlus, Users, X, Code2, Award,
} from 'lucide-react';
import { CreditsPage } from './pages/credits-page';
import { BackroomsGame } from './components/backrooms-game';
import './index.css';

/** ── Credits footer shown on every page ─────────────────────────────────── */
function CreditsFooter({ dark = false }: { dark?: boolean }) {
  const year = new Date().getFullYear();
  return (
    <footer className={`credits-footer${dark ? ' auth-footer-wrap' : ''}`}>
      <div className="credits-left">
        <span className="credits-mark"><Radio size={16} /></span>
        <div className="credits-author">
          <strong>MOHAMMED DANSEER Z</strong>
          <span className="credits-made-tag">THE GAME IS MADE BY HIM</span>
        </div>
      </div>
      <div className="credits-center">
        <span className="credits-title">THE BACKROOMS: LAST EXIT</span>
        <div className="credits-url-pill">
          <Link href="/credits" className="credits-link-active" title="View Full Game Credits">
            <span>CREDITS URL:</span> <b>/credits</b>
          </Link>
          <span className="credits-sep">|</span>
          <Link href="/play" className="credits-link-active" title="Play Level 0 Simulation">
            <span>PLAY:</span> <b>/play</b>
          </Link>
        </div>
      </div>
      <div className="credits-right">
        <Link href="/credits" className="credits-text-link">
          Credits Page
        </Link>
        <span className="credits-divider" />
        <a
          href="https://github.com/mdanseergit"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub profile of Mohammed Danseer Z"
        >
          <Code2 size={13} /> @mdanseergit
        </a>
        <span className="credits-divider" />
        <span className="credits-studios">© {year} LAST EXIT STUDIOS</span>
      </div>
    </footer>
  );
}

const queryClient = new QueryClient();
const scopedKeys = [
  getGetCurrentUserQueryKey(), getGetFriendsQueryKey(), getGetFriendRequestsQueryKey(),
  getGetBlockedPlayersQueryKey(), getGetCurrentPartyQueryKey(),
  getGetPartyInvitationsQueryKey(), getGetLobbySummaryQueryKey(),
];
const refreshScoped = (qc: ReturnType<typeof useQueryClient>) =>
  Promise.all(scopedKeys.map((queryKey) => qc.invalidateQueries({ queryKey })));

function useOperations() {
  const qc = useQueryClient();
  const register = useRegisterUser();
  const login = useLoginUser();
  const createGuest = useCreateGuest();
  const logout = useLogoutUser();
  const sendRequest = useSendFriendRequest();
  const acceptRequest = useAcceptFriendRequest();
  const declineRequest = useDeclineFriendRequest();
  const removeFriend = useRemoveFriend();
  const block = useBlockPlayer();
  const unblock = useUnblockPlayer();
  const createParty = useCreateParty();
  const joinParty = useJoinParty();
  const invite = useInviteToParty();
  const acceptInvite = useAcceptPartyInvitation();
  const declineInvite = useDeclinePartyInvitation();
  const leaveParty = useLeaveParty();
  const setReady = useSetPartyReady();
  const setTeam = useSetPartyTeam();
  const setMode = useSetPartyMode();
  const startParty = useStartParty();
  const after = (signedOut = false) => {
    if (signedOut) qc.removeQueries({ queryKey: getGetCurrentUserQueryKey() });
    return refreshScoped(qc);
  };
  return {
    register, login, createGuest, logout, sendRequest, acceptRequest, declineRequest,
    removeFriend, block, unblock, createParty, joinParty, invite, acceptInvite,
    declineInvite, leaveParty, setReady, setTeam, setMode, startParty, after,
  };
}
type Ops = ReturnType<typeof useOperations>;
const errText = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

function Wordmark({ compact = false }: { compact?: boolean }) {
  return <div className={`wordmark ${compact ? 'wordmark-small' : ''}`}>
    <span className="wordmark-mark"><Radio size={compact ? 15 : 19} /></span>
    <span>LAST<span className="wordmark-gap">/</span>EXIT</span>
  </div>;
}

function StatusDot({ presence }: { presence: string }) {
  return <span className={`status-dot ${presence === 'online' ? 'is-online' : presence === 'in-game' ? 'is-game' : ''}`} title={presence} />;
}

function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return <span className={`avatar avatar-${index % 4}`} aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>;
}

function LoadingScene({ label = 'Checking the signal' }: { label?: string }) {
  return <main className="loading-scene"><div className="loading-bars"><i /><i /><i /></div><span>{label}</span></main>;
}

function Message({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' }) {
  return <div className={`message message-${tone}`} role="status">{children}</div>;
}

function AuthScreen({ ops, onDone }: { ops: Ops; onDone: () => void }) {
  const [isRegister, setIsRegister] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const action = isRegister ? ops.register : ops.login;
  const pending = action.isPending || ops.createGuest.isPending;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await action.mutateAsync({ data: { username: username.trim(), password } });
      await ops.after();
      onDone();
    } catch (e) { setError(errText(e)); }
  };
  const continueAsGuest = async () => {
    setError('');
    try {
      await ops.createGuest.mutateAsync();
      await ops.after();
      onDone();
    } catch (e) { setError(errText(e)); }
  };
  return <main className="auth-page film-grain">
    <div className="auth-brand">
      <Wordmark />
      <div className="auth-brand-credits">
        <Link href="/credits" className="brand-credits-link" title="The game is made by Mohammed Danseer Z">
          <Award size={13} /> CREDITS: <b>/credits</b>
        </Link>
        <Link href="/play" className="brand-play-link" title="Play Live Level 0 Backrooms Game">
          <Gamepad2 size={13} /> PLAY DEMO
        </Link>
      </div>
      <div className="rec"><span /> REC <b>00:00:14</b></div>
    </div>
    <div className="auth-columns">
      <section className="auth-story">
        <p className="eyebrow">FOUND FOOTAGE FILE 01 / 1997</p>
        <h1>THE<br /><em>BACKROOMS</em><br />LAST EXIT</h1>
        <div className="story-rule" />
        <p className="story-copy">There is no map out.<br />Only the people you brought with you.</p>
        <div className="footage-stamp"><Film size={15} /> CAM 04 <span>NO SIGNAL</span></div>
      </section>
      <section className="auth-card paper-shadow">
        <div className="card-topline"><span>ACCESS TERMINAL</span><span>SECTOR 0</span></div>
        <h2>{isRegister ? 'Make an account' : 'Return to the signal'}</h2>
        <p className="muted">Keep your crew close. The halls rearrange.</p>
        <form onSubmit={submit} className="form-stack">
          <label>PLAYER NAME<input data-testid="input-username" autoComplete="username" minLength={3} maxLength={16} pattern="[A-Za-z0-9_]+" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3–16 characters" /></label>
          <label>PASSphrase<input data-testid="input-password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={10} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters" /></label>
          {error && <Message>{error}</Message>}
          <button data-testid="button-auth-submit" className="button button-primary button-wide" disabled={pending}>{pending ? 'Tuning the signal…' : isRegister ? 'Create your file' : 'Sign in'} <ArrowRight size={16} /></button>
        </form>
        <div className="switch-auth">{isRegister ? 'Already have a file?' : 'New to the halls?'} <button data-testid="button-auth-toggle" onClick={() => { setIsRegister(!isRegister); setError(''); }}>{isRegister ? 'Sign in' : 'Register'}</button></div>
        <div className="guest-entry"><span>OR SKIP THE ACCOUNT</span><button data-testid="button-guest-entry" type="button" onClick={continueAsGuest} disabled={pending}>{ops.createGuest.isPending ? 'Opening a temporary file…' : 'Continue as a Wanderer'}</button></div>
        <p className="fine-print">Username: letters, numbers, underscore. Your session is private to this browser.</p>
      </section>
    </div>
    <footer className="auth-foot">
      <span>ARCHIVE REF: LE-00-041</span>
      <span>THE GAME IS MADE BY MOHAMMED DANSEER Z</span>
      <Link href="/credits" className="auth-foot-link">FULL CREDITS: /credits</Link>
      <span>© LAST EXIT STUDIOS</span>
    </footer>
    <CreditsFooter dark />
  </main>;
}

function TopBar({ user, ops }: { user: Player; ops: Ops }) {
  const [, setLocation] = useLocation();
  const [showMenu, setShowMenu] = useState(false);
  const doLogout = async () => {
    try { await ops.logout.mutateAsync(); await ops.after(true); setLocation('/'); }
    catch { /* session remains usable; auth query refresh below will reveal its state */ }
  };
  return <header className="topbar">
    <Link href="/" className="topbar-logo"><Wordmark compact /></Link>
    <div className="topbar-center">
      <span className="live-pip" />
      <Link href="/credits" className="topbar-credits-link" title="The game is made by Mohammed Danseer Z">
        MADE BY MOHAMMED DANSEER Z <span className="topbar-sep">/</span> CREDITS: <b>/credits</b>
      </Link>
    </div>
    <div className="topbar-actions">
      <Link href="/play" className="button button-small button-outline topbar-play-btn" title="Launch playable 3D simulation">
        <Gamepad2 size={13} /> Play
      </Link>
      <Link href="/credits" className="button button-small button-outline topbar-credits-btn" title="View credits">
        Credits
      </Link>
      <div className="profile-wrap">
        <button className="profile-button focus-ring" data-testid="button-profile-menu" onClick={() => setShowMenu(!showMenu)}>
          <Avatar name={user.username} /><span>{user.username}</span><ChevronDown size={14} />
        </button>
        {showMenu && (
          <div className="profile-menu">
            <div className="profile-menu-meta">PLAYER RECORD<br /><b>{user.username}</b></div>
            <Link href="/credits" className="profile-menu-link" onClick={() => setShowMenu(false)}>
              <Award size={14} /> Game Credits (/credits)
            </Link>
            <button onClick={doLogout} data-testid="button-signout"><LogOut size={15} /> Sign out</button>
          </div>
        )}
      </div>
    </div>
  </header>;
}

function Shell({ user, ops, children }: { user: Player; ops: Ops; children: ReactNode }) {
  const [location] = useLocation();
  return <div className="app-shell film-grain">
    <TopBar user={user} ops={ops} />
    <div className="app-layout">
      <aside className="side-rail">
        <div className="rail-heading">YOUR TERMINAL</div>
        <Link href="/" className={`rail-link ${location === '/' ? 'rail-active' : ''}`}><Gamepad2 size={17} /> Main menu</Link>
        <Link href="/play" className={`rail-link ${location === '/play' ? 'rail-active' : ''}`}><Film size={17} /> Play Level 0 <span className="rail-index">LIVE</span></Link>
        <Link href="/friends" className={`rail-link ${location === '/friends' ? 'rail-active' : ''}`}><Users size={17} /> Crew <span className="rail-index">01</span></Link>
        <Link href="/party" className={`rail-link ${location === '/party' ? 'rail-active' : ''}`}><DoorOpen size={17} /> Party <span className="rail-index">02</span></Link>
        <Link href="/credits" className={`rail-link ${location === '/credits' ? 'rail-active' : ''}`}><Award size={17} /> Credits <span className="rail-index">URL</span></Link>
        <div className="rail-note">
          <span>FIELD NOTE 07</span>
          <p>The game is made by Mohammed Danseer Z. Search for the exit tapes.</p>
          <Link href="/credits" className="rail-credits-tag">Credits (/credits)</Link>
        </div>
        <div className="rail-bottom"><span className="signal-bars"><i /><i /><i /><i /></span><span>LOCAL SIGNAL<br /><b>STABLE</b></span></div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
    <CreditsFooter />
  </div>;
}

function AuthRequired() {
  return <div className="auth-required">
    <LockKeyhole size={26} />
    <h2>This file is sealed.</h2>
    <p>Sign in at the terminal before entering the crew records.</p>
    <div style={{ display: 'flex', gap: '10px', margin: '15px 0', flexWrap: 'wrap', justifyContent: 'center' }}>
      <Link href="/" className="button button-primary">Return to access <ArrowRight size={15} /></Link>
      <Link href="/credits" className="button button-outline">Game Credits (/credits)</Link>
      <Link href="/play" className="button button-outline"><Gamepad2 size={14} /> Play Level 0</Link>
    </div>
    <CreditsFooter />
  </div>;
}

function HomeScreen({ user, ops }: { user: Player; ops: Ops }) {
  const summary = useGetLobbySummary({
    query: { queryKey: getGetLobbySummaryQueryKey(), refetchInterval: 15_000 },
  });
  const [, setLocation] = useLocation();
  const [logoutError, setLogoutError] = useState('');
  const startLogout = async () => {
    setLogoutError('');
    try { await ops.logout.mutateAsync(); await ops.after(true); setLocation('/'); }
    catch (e) { setLogoutError(errText(e)); }
  };
  return <Shell user={user} ops={ops}>
    <section className="home-hero">
      <div className="hero-overlay scanlines" />
      <div className="hero-copy fade-in">
        <div className="eyebrow hero-eyebrow"><span className="red-square" /> RECORDING 01:12:08 / LOST MEDIA</div>
        <h1>THE<br /><span>BACKROOMS</span><br /><em>LAST EXIT</em></h1>
        <p>YOU ARE NOT ALONE.<br />THAT IS NOT ALWAYS GOOD.</p>
        <div className="hero-actions">
          <Link href="/play" className="button button-primary button-large" data-testid="link-play-game"><Gamepad2 size={18} /> Play Level 0 (Live)</Link>
          <Link href="/party" className="button button-outline button-large" data-testid="link-enter-party">Enter the lobby <ArrowRight size={18} /></Link>
          <Link href="/credits" className="button button-outline button-large" data-testid="link-credits"><Award size={17} /> Game Credits (/credits)</Link>
        </div>
      </div>
      <div className="hero-caption"><span>CAMERA 04 / NIGHT VISION OFF</span><span>LEVEL 0 — UNKNOWN</span></div>
      <div className="hero-coordinate">37° 14′ 06.2″ N<br />115° 48′ 40.1″ W</div>
    </section>
    <section className="home-lower">
      <div className="welcome-strip"><div><span className="eyebrow">OPERATOR IDENTIFIED</span><h2>Welcome back, {user.username}.</h2></div><div className="welcome-status"><StatusDot presence={user.presence} /><span>{user.presence === 'in-game' ? 'IN ANOTHER RUN' : 'READY TO ENTER'}</span><button onClick={startLogout} className="text-button" data-testid="button-quick-signout">Sign out <ArrowDownRight size={14} /></button></div></div>
      {logoutError && <Message>{logoutError}</Message>}
      <div className="home-data">
        <div className="tape-note"><div className="eyebrow"><span className="red-square" /> CURRENT TRANSMISSION</div><p>“The wallpaper is damp. The hum is getting closer. If you can hear me, do not take the stairs.”</p><span>— TAPE 04, SIDE B</span></div>
        <div className="dashboard-stats">
          {summary.isLoading ? <div className="stat-skeleton"><i /><i /><i /></div> : summary.isError ? <div className="summary-error"><p>Signal interrupted. Could not read your records.</p><button className="text-button" onClick={() => summary.refetch()}>Retry <ArrowRight size={14} /></button></div> : <>
            <Link href="/friends" className="stat-item"><span className="stat-number">{summary.data?.friendsOnline ?? 0}</span><span className="stat-label">CREW ONLINE</span><ArrowRight size={15} /></Link>
            <Link href="/friends" className="stat-item"><span className="stat-number">{summary.data?.incomingFriendRequests ?? 0}</span><span className="stat-label">NEW SIGNALS</span><ArrowRight size={15} /></Link>
            <Link href="/party" className="stat-item"><span className="stat-number">{summary.data?.partyInvitations ?? 0}</span><span className="stat-label">PARTY INVITES</span><ArrowRight size={15} /></Link>
          </>}
        </div>
      </div>
      <div className="phase-note"><span>PHASE 01 // LIVE ENGINE</span><p>Playable Level 0 maze simulation is active. Conceived, designed and engineered by <b>MOHAMMED DANSEER Z</b>.</p><Link href="/credits" className="text-button">Credits (/credits) <ArrowRight size={14} /></Link></div>
    </section>
  </Shell>;
}

function SectionHeading({ eyebrow, title, note }: { eyebrow: string; title: string; note: string }) {
  return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="section-note">{note}</p></div><span className="heading-mark"><ArrowDownRight size={24} /></span></div>;
}

function FriendsScreen({ user, ops }: { user: Player; ops: Ops }) {
  const friends = useGetFriends({
    query: { queryKey: getGetFriendsQueryKey(), refetchInterval: 30_000 },
  });
  const requests = useGetFriendRequests({
    query: { queryKey: getGetFriendRequestsQueryKey(), refetchInterval: 15_000 },
  });
  const blocked = useGetBlockedPlayers({
    query: { queryKey: getGetBlockedPlayersQueryKey(), refetchInterval: 30_000 },
  });
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success');
  const [pendingId, setPendingId] = useState('');
  const refresh = async () => { await ops.after(); };
  const send = async (e: FormEvent) => {
    e.preventDefault(); setMessage('');
    try { await ops.sendRequest.mutateAsync({ data: { username: username.trim() } }); setUsername(''); setMessage('Request sent into the halls.'); setMessageTone('success'); await refresh(); }
    catch (err) { setMessage(errText(err)); setMessageTone('error'); }
  };
  const runRequest = async (id: string, accept: boolean) => {
    setPendingId(id);
    try { await (accept ? ops.acceptRequest : ops.declineRequest).mutateAsync({ requestId: id }); await refresh(); }
    catch (e) { setMessage(errText(e)); setMessageTone('error'); }
    finally { setPendingId(''); }
  };
  const runFriendAction = async (friend: Friend, kind: 'remove' | 'block') => {
    const confirmText = kind === 'remove' ? `Remove ${friend.username} from your crew?` : `Block ${friend.username}? They will no longer be able to contact you.`;
    if (!window.confirm(confirmText)) return;
    setPendingId(friend.userId);
    try {
      if (kind === 'remove') await ops.removeFriend.mutateAsync({ friendId: friend.userId });
      else await ops.block.mutateAsync({ data: { username: friend.username } });
      await refresh();
    } catch (e) { setMessage(errText(e)); setMessageTone('error'); }
    finally { setPendingId(''); }
  };
  const doUnblock = async (id: string) => {
    setPendingId(id);
    try { await ops.unblock.mutateAsync({ playerId: id }); await refresh(); }
    catch (e) { setMessage(errText(e)); setMessageTone('error'); }
    finally { setPendingId(''); }
  };
  return <Shell user={user} ops={ops}>
    <div className="friends-page">
      <SectionHeading eyebrow="FIELD DIRECTORY / 01" title="Crew records" note="Exact callsigns only. Someone out there may be listening." />
      <form className="add-friend-panel" onSubmit={send}>
        <div className="add-friend-copy"><span className="panel-icon"><UserPlus size={20} /></span><div><b>Send a crew request</b><small>Enter their exact player name to find them.</small></div></div>
        <div className="add-friend-input"><input data-testid="input-friend-username" aria-label="Exact username" minLength={3} maxLength={16} required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Exact username" /><button className="button button-primary" disabled={ops.sendRequest.isPending} data-testid="button-send-request">{ops.sendRequest.isPending ? 'Sending…' : 'Send request'} <ArrowRight size={15} /></button></div>
      </form>
      {message && <Message tone={messageTone}>{message}</Message>}
      <div className="friend-columns">
        <section className="list-panel">
          <div className="list-title"><div><span className="eyebrow">ACTIVE CONTACTS</span><h2>Your crew</h2></div><span className="count-badge">{friends.data?.length ?? '—'}</span></div>
          {friends.isLoading ? <ListSkeleton /> : friends.isError ? <RetryState text="Crew records could not be loaded." onRetry={() => friends.refetch()} /> : friends.data?.length ? <div className="person-list">{friends.data.map((friend, i) => <div className="person-row" key={friend.userId} data-testid={`row-friend-${friend.userId}`}><Avatar name={friend.username} index={i} /><div className="person-name"><b>{friend.username}</b><span><StatusDot presence={friend.presence} />{friend.presence === 'in-game' ? 'In a run' : friend.presence}</span></div><div className="row-actions"><button className="icon-button" title="Remove friend" aria-label={`Remove ${friend.username}`} disabled={pendingId === friend.userId} onClick={() => runFriendAction(friend, 'remove')}><X size={16} /></button><button className="icon-button danger-icon" title="Block player" aria-label={`Block ${friend.username}`} disabled={pendingId === friend.userId} onClick={() => runFriendAction(friend, 'block')}><Shield size={16} /></button></div></div>)}</div> : <EmptyState title="No one on the line." detail="Your crew list is quiet. Search for someone by their exact username." />}
        </section>
        <section className="list-panel">
          <div className="list-title"><div><span className="eyebrow">INCOMING SIGNALS</span><h2>Requests</h2></div><span className="count-badge">{requests.data?.length ?? '—'}</span></div>
          {requests.isLoading ? <ListSkeleton /> : requests.isError ? <RetryState text="Incoming requests could not be read." onRetry={() => requests.refetch()} /> : requests.data?.length ? <div className="person-list">{requests.data.map((request, i) => <div className="person-row request-row" key={request.id} data-testid={`row-request-${request.id}`}><Avatar name={request.username} index={i + 1} /><div className="person-name"><b>{request.username}</b><span>Found you {new Date(request.createdAt).toLocaleDateString()}</span></div><div className="row-actions"><button className="icon-button accept-icon" title="Accept request" aria-label={`Accept ${request.username}`} disabled={pendingId === request.id} onClick={() => runRequest(request.id, true)}><Check size={17} /></button><button className="icon-button" title="Decline request" aria-label={`Decline ${request.username}`} disabled={pendingId === request.id} onClick={() => runRequest(request.id, false)}><X size={16} /></button></div></div>)}</div> : <EmptyState title="No unanswered signals." detail="New requests will appear here." />}
        </section>
      </div>
      <section className="blocked-panel">
        <div className="list-title"><div><span className="eyebrow">DO NOT ANSWER</span><h2>Blocked players</h2></div><Shield size={18} /></div>
        {blocked.isLoading ? <ListSkeleton /> : blocked.isError ? <RetryState text="Block list unavailable." onRetry={() => blocked.refetch()} /> : blocked.data?.length ? <div className="blocked-list">{blocked.data.map((person) => <div className="blocked-person" key={person.userId}><span>{person.username}</span><button className="text-button" onClick={() => doUnblock(person.userId)} disabled={pendingId === person.userId} data-testid={`button-unblock-${person.userId}`}>{pendingId === person.userId ? 'Unblocking…' : 'Unblock'} <ArrowRight size={14} /></button></div>)}</div> : <p className="muted empty-inline">No one is blocked.</p>}
      </section>
      <div className="page-stamp">RECORDS SUBJECT: {user.username.toUpperCase()} <span>•</span> LAST SYNCED LOCALLY</div>
    </div>
  </Shell>;
}

function ListSkeleton() {
  return <div className="skeleton-list"><i /><i /><i /></div>;
}
function RetryState({ text, onRetry }: { text: string; onRetry: () => void }) {
  return <div className="retry-state"><p>{text}</p><button className="text-button" onClick={onRetry}>Retry <ArrowRight size={14} /></button></div>;
}
function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><span className="empty-dash">—</span><b>{title}</b><p>{detail}</p></div>;
}

function PartyScreen({ user, ops }: { user: Player; ops: Ops }) {
  const partyQuery = useGetCurrentParty({
    query: { queryKey: getGetCurrentPartyQueryKey(), refetchInterval: 5_000 },
  });
  const invitations = useGetPartyInvitations({
    query: { queryKey: getGetPartyInvitationsQueryKey(), refetchInterval: 10_000 },
  });
  const friends = useGetFriends({
    query: { queryKey: getGetFriendsQueryKey(), refetchInterval: 30_000 },
  });
  const party = partyQuery.data?.party ?? null;
  const [roomCode, setRoomCode] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [selectedMode, setSelectedMode] = useState<PartyMode>('coop-squad');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [, setLocation] = useLocation();
  const refresh = async () => { await ops.after(); };
  const run = async (operation: () => Promise<unknown>, success?: string) => {
    setError(''); setNotice('');
    try { await operation(); await refresh(); if (success) setNotice(success); }
    catch (e) { setError(errText(e)); }
  };
  const makeParty = () => run(() => ops.createParty.mutateAsync({ data: { mode: selectedMode, isPrivate } }));
  const joinByCode = (e: FormEvent) => { e.preventDefault(); run(() => ops.joinParty.mutateAsync({ data: { roomCode: roomCode.toUpperCase() } })); };
  const changeMode = (mode: PartyMode) => { setSelectedMode(mode); if (party?.members.find((m) => m.userId === user.id)?.isLeader) run(() => ops.setMode.mutateAsync({ data: { mode } })); };
  const doInvite = (e: FormEvent) => { e.preventDefault(); if (!inviteName) return; run(() => ops.invite.mutateAsync({ data: { username: inviteName } }), `Invitation sent to ${inviteName}.`); setInviteName(''); };
  const acceptInvite = (id: string) => run(async () => { await ops.acceptInvite.mutateAsync({ invitationId: id }); setLocation('/party'); });
  const leave = () => { if (window.confirm('Leave this party?')) run(() => ops.leaveParty.mutateAsync(), 'You left the party.'); };
  const currentMember = party?.members.find((member) => member.userId === user.id);
  const allReady = !!party && party.members.length > 0 && party.members.every((m) => m.ready);
  const occupied = new Map((party?.members ?? []).map((m) => [m.teamSlot, m]));
  return <Shell user={user} ops={ops}>
    <div className="party-page">
      <SectionHeading eyebrow="COOPERATIVE ACCESS / 02" title="Party lobby" note="Four slots. One exit, if the walls agree." />
      {error && <Message>{error}</Message>}
      {notice && <Message tone="success">{notice}</Message>}
      {partyQuery.isLoading ? <div className="party-loading"><div className="party-skeleton" /><div className="party-skeleton" /></div> : partyQuery.isError ? <RetryState text="Party signal is unavailable." onRetry={() => partyQuery.refetch()} /> : party ? <PartyLobby party={party} user={user} ops={ops} friends={friends.data ?? []} currentMember={currentMember} allReady={allReady} occupied={occupied} onRun={run} onLeave={leave} onMode={changeMode} inviteName={inviteName} setInviteName={setInviteName} onInvite={doInvite} /> : <div className="party-start-grid">
        <section className="party-create-panel paper-shadow">
          <div className="panel-kicker"><span className="panel-icon"><DoorOpen size={20} /></span><span className="eyebrow">OPEN A NEW DOOR</span></div>
          <h2>Start a party</h2><p>Make a private room for your crew, or leave the door open to anyone with the code.</p>
          <div className="mode-options">
            <button className={`mode-option ${selectedMode === 'coop-squad' ? 'mode-selected' : ''}`} onClick={() => setSelectedMode('coop-squad')} data-testid="button-mode-coop"><span className="mode-icon"><Users size={18} /></span><span><b>Co-op squad</b><small>Stay together. Find the way out.</small></span><span className="mode-radio" /></button>
            <button className={`mode-option ${selectedMode === 'team-race' ? 'mode-selected' : ''}`} onClick={() => setSelectedMode('team-race')} data-testid="button-mode-race"><span className="mode-icon"><Radio size={18} /></span><span><b>Team race</b><small>Split up. Compare your escape.</small></span><span className="mode-radio" /></button>
          </div>
          <label className="toggle-row"><span><b>Private room</b><small>Only invited players can enter.</small></span><input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} data-testid="toggle-private-party" /><span className="toggle-visual" /></label>
          <button className="button button-primary button-wide" onClick={makeParty} disabled={ops.createParty.isPending} data-testid="button-create-party">{ops.createParty.isPending ? 'Opening the door…' : 'Create party'} <ArrowRight size={16} /></button>
        </section>
        <div className="party-aside">
          <section className="join-panel">
            <div className="eyebrow">SOMEONE LEFT A CODE</div><h2>Join a party</h2><p>Enter the six-character room code exactly as you received it.</p>
            <form className="join-form" onSubmit={joinByCode}><input data-testid="input-room-code" aria-label="Six-character room code" maxLength={6} minLength={6} pattern="[A-Z0-9]{6}" required value={roomCode} onChange={(e) => setRoomCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())} placeholder="XXXXXX" /><button className="button button-dark" disabled={ops.joinParty.isPending} data-testid="button-join-party">{ops.joinParty.isPending ? 'Joining…' : 'Join'} <ArrowRight size={15} /></button></form>
          </section>
          <section className="incoming-panel"><div className="list-title"><div><span className="eyebrow">INCOMING</span><h2>Party invitations</h2></div><span className="count-badge">{invitations.data?.length ?? '—'}</span></div>
            {invitations.isLoading ? <ListSkeleton /> : invitations.isError ? <RetryState text="Invitations did not come through." onRetry={() => invitations.refetch()} /> : invitations.data?.length ? invitations.data.map((inv) => <div className="invite-row" key={inv.id} data-testid={`invite-${inv.id}`}><div><b>{inv.fromUsername}</b><small>Room {inv.roomCode}</small></div><button className="button button-small button-primary" onClick={() => acceptInvite(inv.id)} disabled={ops.acceptInvite.isPending}>Join <ArrowRight size={13} /></button><button className="icon-button" title="Decline invitation" onClick={() => run(() => ops.declineInvite.mutateAsync({ invitationId: inv.id }))}><X size={15} /></button></div>) : <p className="muted empty-inline">No invitations waiting in the static.</p>}
          </section>
        </div>
      </div>}
      <div className="phase-note party-phase">
        <span>SIMULATION ACCESS</span>
        <p>Ready to explore? Launch the live Level 0 maze engine solo or while assembling your crew.</p>
        <Link href="/play" className="button button-small button-primary"><Gamepad2 size={14} /> Launch Level 0</Link>
      </div>
    </div>
  </Shell>;
}

type PartyLobbyProps = {
  party: Party; user: Player; ops: Ops; friends: Friend[];
  currentMember?: PartyMember; allReady: boolean; occupied: Map<number, PartyMember>;
  onRun: (operation: () => Promise<unknown>, success?: string) => Promise<void>;
  onLeave: () => void; onMode: (mode: PartyMode) => void;
  inviteName: string; setInviteName: (name: string) => void; onInvite: (e: FormEvent) => void;
};
function PartyLobby({ party, user, ops, friends, currentMember, allReady, occupied, onRun, onLeave, onMode, inviteName, setInviteName, onInvite }: PartyLobbyProps) {
  const [copied, setCopied] = useState(false);
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(party.roomCode); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
    catch { setCopied(false); }
  };
  const start = () => onRun(() => ops.startParty.mutateAsync(), 'Party status changed to starting. This lobby remains open.');
  const changeTeam = (teamSlot: number) => onRun(() => ops.setTeam.mutateAsync({ data: { teamSlot } }));
  const isLeader = !!currentMember?.isLeader;
  const modeLabel = party.mode === 'coop-squad' ? 'Co-op squad' : 'Team race';
  return <section className="lobby-board paper-shadow">
    <header className="lobby-header"><div><div className="eyebrow"><span className="red-square" /> PARTY ROOM / {party.status.toUpperCase()}</div><h2>{party.status === 'starting' ? 'Signal initiated.' : 'The crew is assembling.'}</h2></div><div className="lobby-status"><StatusDot presence="online" /><span>{party.status === 'lobby' ? 'LOBBY OPEN' : party.status.toUpperCase()}</span></div></header>
    <div className="lobby-code-row"><div><span className="eyebrow">ROOM CODE</span><strong>{party.roomCode}</strong></div><button className="copy-code" onClick={copyCode} data-testid="button-copy-room-code">{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy code'}</button><span className="privacy-mark">{party.isPrivate ? <><LockKeyhole size={14} /> PRIVATE</> : <><Radio size={14} /> OPEN ROOM</>}</span></div>
    <div className="lobby-columns">
      <div className="roster-area">
        <div className="list-title"><div><span className="eyebrow">FOUR-PERSON UNIT</span><h3>Team slots</h3></div><span className="count-badge">{party.members.length}/4</span></div>
        <div className="team-slots">{[1, 2, 3, 4].map((slot) => {
          const member = occupied.get(slot);
          return <button key={slot} className={`team-slot ${member ? 'slot-filled' : 'slot-empty'} ${member?.userId === user.id ? 'slot-self' : ''}`} disabled={!currentMember || (member && member.userId !== user.id)} onClick={() => changeTeam(slot)} data-testid={`button-team-slot-${slot}`}>
            <span className="slot-number">0{slot}</span>{member ? <><Avatar name={member.username} index={slot} /><span className="slot-person"><b>{member.username}{member.isLeader && <small className="leader-tag">HOST</small>}</b><small><StatusDot presence={member.presence} />{member.presence === 'online' ? member.ready ? 'READY' : 'NOT READY' : member.presence.toUpperCase()}</small></span><span className={`ready-check ${member.ready ? 'ready-on' : ''}`}>{member.ready ? <Check size={14} /> : '—'}</span></> : <><span className="slot-empty-icon"><Plus size={17} /></span><span className="slot-person"><b>Open slot</b><small>Tap to move here</small></span></>}
          </button>;
        })}</div>
        <div className="mode-picker"><span className="eyebrow">PARTY MODE</span><div className="mode-chips"><button className={party.mode === 'coop-squad' ? 'chip-selected' : ''} disabled={!isLeader} onClick={() => onMode('coop-squad')} data-testid="button-party-mode-coop">Co-op squad</button><button className={party.mode === 'team-race' ? 'chip-selected' : ''} disabled={!isLeader} onClick={() => onMode('team-race')} data-testid="button-party-mode-race">Team race</button></div><span className="mode-current">{modeLabel} {isLeader ? '— host controls' : '— host controls mode'}</span></div>
      </div>
      <aside className="lobby-side">
        <div className="ready-panel"><span className="eyebrow">YOUR STATUS</span><div className="ready-status"><span className={`ready-indicator ${currentMember?.ready ? 'ready-indicator-on' : ''}`} />{currentMember?.ready ? 'READY' : 'NOT READY'}</div><button className={`button ${currentMember?.ready ? 'button-outline' : 'button-primary'} button-wide`} onClick={() => onRun(() => ops.setReady.mutateAsync({ data: { ready: !currentMember?.ready } }))} disabled={ops.setReady.isPending || !currentMember} data-testid="button-ready-toggle">{ops.setReady.isPending ? 'Updating…' : currentMember?.ready ? 'Set not ready' : 'Ready up'} <Check size={15} /></button></div>
        <div className="invite-panel"><div className="eyebrow">CALL IN YOUR CREW</div><form onSubmit={onInvite} className="invite-form"><select aria-label="Choose a friend to invite" value={inviteName} onChange={(e) => setInviteName(e.target.value)} data-testid="select-invite-friend"><option value="">Select a friend</option>{friends.map((friend) => <option key={friend.userId} value={friend.username}>{friend.username} · {friend.presence}</option>)}</select><button className="button button-dark button-wide" disabled={!inviteName || ops.invite.isPending} data-testid="button-invite-friend">{ops.invite.isPending ? 'Sending…' : 'Send invitation'} <ArrowRight size={14} /></button></form>{friends.length === 0 && <small className="invite-hint">Add friends from Crew records first.</small>}</div>
      </aside>
    </div>
    <footer className="lobby-footer">
      <button className="button button-danger-ghost" onClick={onLeave} data-testid="button-leave-party"><ArrowLeft size={15} /> Leave party</button>
      <Link href="/play" className="button button-outline topbar-play-btn"><Gamepad2 size={14} /> Launch Simulation</Link>
      <span>{party.members.length < 2 ? 'Waiting for more crew.' : allReady ? 'Crew status clear.' : 'All crew must be ready to start.'}</span>
      {isLeader && <button className="button button-primary" onClick={start} disabled={!allReady || party.status !== 'lobby' || ops.startParty.isPending} data-testid="button-start-party">{ops.startParty.isPending ? 'Starting…' : party.status === 'starting' ? 'Status: starting' : 'Start party'} <ArrowRight size={15} /></button>}
    </footer>
  </section>;
}

function RouterContent({ user, ops, loading }: { user?: Player; ops: Ops; loading: boolean }) {
  const [location, setLocation] = useLocation();
  /* The game and the credits are standalone: never make them wait on the
     session query, otherwise an unreachable API server leaves the player
     staring at the loading scene instead of the level. */
  const isStandalone = location === '/play' || location === '/credits';
  if (loading && !isStandalone) return <LoadingScene />;
  if (!user) return <Switch>
    <Route path="/credits">{() => <CreditsPage />}</Route>
    <Route path="/play">{() => <BackroomsGame />}</Route>
    <Route path="/">{() => <AuthScreen ops={ops} onDone={() => setLocation('/')} />}</Route>
    <Route>{() => <AuthRequired />}</Route>
  </Switch>;
  return <Switch>
    <Route path="/">{() => <HomeScreen user={user} ops={ops} />}</Route>
    <Route path="/play">{() => <BackroomsGame />}</Route>
    <Route path="/credits">{() => <CreditsPage />}</Route>
    <Route path="/friends">{() => <FriendsScreen user={user} ops={ops} />}</Route>
    <Route path="/party">{() => <PartyScreen user={user} ops={ops} />}</Route>
    <Route>{() => (
      <div className="not-found">
        <span className="eyebrow">TAPE DAMAGED / 404</span>
        <h1>This hallway was not here before.</h1>
        <div style={{ display: 'flex', gap: '10px', marginTop: '15px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/" className="button button-primary">Back to the terminal</Link>
          <Link href="/credits" className="button button-outline">Game Credits (/credits)</Link>
          <Link href="/play" className="button button-outline"><Gamepad2 size={14} /> Play Level 0</Link>
        </div>
        <CreditsFooter />
      </div>
    )}</Route>
  </Switch>;
}

function AppContent() {
  const ops = useOperations();
  const userQuery = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      refetchInterval: 45_000,
      refetchOnWindowFocus: true,
      retry: false,
    },
  });
  const [location] = useLocation();
  const user = userQuery.data;
  const loading = userQuery.isLoading;
  return <RouterContent key={location === '/' ? 'home' : location} user={user} ops={ops} loading={loading} />;
}

function App() {
  return <QueryClientProvider client={queryClient}>
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AppContent />
    </WouterRouter>
  </QueryClientProvider>;
}

export default App;