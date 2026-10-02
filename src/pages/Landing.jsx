import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  ContactRound,
  Instagram,
  Mail,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Search,
  Send,
  Users,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import './landing.css';

const channels = [
  { name: 'WhatsApp', icon: MessageCircle, color: '#18a65b' },
  { name: 'Instagram', icon: Instagram, color: '#d73585' },
  { name: 'Messenger', icon: MessageSquare, color: '#1685ed' },
  { name: 'Telegram', icon: Send, color: '#258dcc' },
  { name: 'Email', icon: Mail, color: '#e87945' },
  { name: 'Website chat', icon: CircleHelp, color: '#2788d8' },
];

const people = [
  ['SC', 'Sarah Chen', 'Hi, I’m interested in your Growth plan…', '10:24', 'green'],
  ['JO', 'James Okafor', 'Do you have a demo this week?', '09:18', 'blue'],
  ['PN', 'Priya Nair', 'Can you share your pricing?', '08:43', 'purple'],
  ['CM', 'Carlos Mendez', 'That works, thank you!', 'Yesterday', 'orange'],
  ['GP', 'Grace Phiri', 'Following up on my enquiry', 'Yesterday', 'pink'],
];

const steps = [
  [
    '01',
    'Capture',
    'Messages arrive from WhatsApp, Instagram, Messenger, Telegram, email and web.',
  ],
  [
    '02',
    'Route',
    'Automatically assign conversations to the right team member or AI agent.',
  ],
  [
    '03',
    'Respond',
    'Your team or AI responds with the right information, faster.',
  ],
  [
    '04',
    'Qualify',
    'Turn conversations into leads with contact details, sources and deal stages.',
  ],
  [
    '05',
    'Close',
    'Track deals, run campaigns and turn more conversations into revenue.',
  ],
];

const features = [
  {
    icon: MessageSquare,
    name: 'Omnichannel Inbox',
    desc: 'Manage every customer conversation in one shared workspace.',
    type: 'inbox',
  },
  {
    icon: ContactRound,
    name: 'Customer CRM',
    desc: 'Keep the context, lead source and next step close to every conversation.',
    type: 'crm',
  },
  {
    icon: Bot,
    name: 'AI Agents',
    desc: 'Answer common questions and qualify leads using your own knowledge.',
    type: 'ai',
  },
  {
    icon: Users,
    name: 'Team Collaboration',
    desc: 'Assign ownership, collaborate in real time and keep response times visible.',
    type: 'team',
  },
  {
    icon: Send,
    name: 'Broadcast Campaigns',
    desc: 'Send WhatsApp template broadcasts and track delivery and replies.',
    type: 'campaign',
  },
  {
    icon: Clock3,
    name: 'SLA Tracking',
    desc: 'Set response targets and see which conversations need attention.',
    type: 'sla',
  },
];

function DashboardPreview({ selectedChannel }) {
  const livePeople = [
    {
      initials: 'SC',
      name: 'Sarah Chen',
      msg: 'I’m interested in your Growth plan…',
      time: '10:24',
      color: 'green',
      channel: 'WhatsApp',
      incoming:
        'Hi, I’m interested in your Growth plan for a 5-person team.',
      reply:
        'Absolutely! I can help with that. The Growth plan supports up to 10 users.',
      source: 'WhatsApp Ad',
      deal: 'Growth Plan (K50,000)',
      stage: 'Proposal',
    },
    {
      initials: 'JO',
      name: 'James Okafor',
      msg: 'Do you have a demo this week?',
      time: '10:26',
      color: 'blue',
      channel: 'Messenger',
      incoming: 'Do you have a demo this week?',
      reply:
        'Yes — we have availability this Thursday. Would you like me to arrange one?',
      source: 'Messenger',
      deal: 'Growth Plan',
      stage: 'Qualified',
    },
    {
      initials: 'PN',
      name: 'Priya Nair',
      msg: 'Can you share your pricing?',
      time: '10:28',
      color: 'purple',
      channel: 'Instagram',
      incoming: 'Can you share your pricing?',
      reply:
        'Of course. I can send you our plans and help you choose the right one.',
      source: 'Instagram Ad',
      deal: 'Starter Plan',
      stage: 'New lead',
    },
  ];

  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [phase, setPhase] = useState('message');
  const [unread, setUnread] = useState(42);

  const channelPerson = livePeople.find(
    (person) => person.channel === selectedChannel
  );

  const active = selectedPerson || channelPerson || livePeople[activeIndex];

  /*
   * When a channel is clicked in the channel bar,
   * select the matching conversation in the inbox.
   */
  useEffect(() => {
    const person = livePeople.find(
      (item) => item.channel === selectedChannel
    );

    if (person) {
      setSelectedPerson(person);
      setActiveIndex(livePeople.indexOf(person));
      setPhase('message');
    }
  }, [selectedChannel]);

  /*
   * Keep the hero alive with a small simulated conversation flow.
   */
  useEffect(() => {
    const sequence = [
      { phase: 'message', delay: 3200 },
      { phase: 'typing', delay: 2200 },
      { phase: 'reply', delay: 3500 },
      { phase: 'assigned', delay: 2400 },
    ];

    let timer;

    const run = (index = 0) => {
      const step = sequence[index];

      timer = setTimeout(() => {
        if (step.phase === 'message') {
          setUnread(43);
        }

        if (step.phase === 'assigned') {
          setUnread(42);
          setActiveIndex((current) => (current + 1) % livePeople.length);
          setSelectedPerson(null);
        }

        setPhase(step.phase);
        run((index + 1) % sequence.length);
      }, step.delay);
    };

    run();

    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      className="nd-dashboard"
      aria-label="Illustrative NyasaDesk inbox product preview"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, ease: 'easeOut' }}
    >
      {/* Sidebar */}
      <aside className="nd-sidebar">
        <div className="nd-brand">
          <span className="nd-mark">N</span>
          <b>NyasaDesk</b>
        </div>

        <div className="nd-workspace">
          BRANDFLETCH
          <ChevronRight size={12} />
        </div>

        {[
          'Inbox',
          'Contacts',
          'Deals',
          'Campaigns',
          'AI Agents',
          'Analytics',
          'Team',
          'Settings',
        ].map((item, i) => (
          <div
            key={item}
            className={`nd-side-item ${i === 0 ? 'active' : ''}`}
          >
            <span>
              {['▣', '◉', '◇', '↗', '✳', '▥', '♧', '⚙'][i]}
            </span>

            {item}

            {i === 0 && (
              <motion.small
                key={unread}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
              >
                {unread}
              </motion.small>
            )}
          </div>
        ))}

        <div className="nd-user">
          <div className="nd-avatar avatar-teal">DK</div>

          <div>
            <b>Daniel K</b>
            <small>Admin</small>
          </div>

          <MoreHorizontal size={16} />
        </div>
      </aside>

      {/* Inbox */}
      <section className="nd-inbox">
        <header>
          <div>
            <strong>Inbox</strong>

            <motion.span
              className="nd-count"
              key={unread}
              initial={{ scale: 1.25 }}
              animate={{ scale: 1 }}
            >
              {unread}
            </motion.span>
          </div>

          <button aria-label="Search conversations">
            <Search size={16} />
          </button>
        </header>

        <div className="nd-filter">
          All <b>{unread}</b>
          <span>WhatsApp</span>
          <span>Instagram</span>
          <span>Web</span>
        </div>

        <div className="nd-search">
          <Search size={14} />
          Search conversations...
        </div>

        {livePeople.map((person, i) => {
          const isSelected = person.name === active.name;

          return (
            <motion.button
              type="button"
              key={person.name}
              className={`nd-conversation ${
                isSelected ? 'selected' : ''
              }`}
              onClick={() => {
                setSelectedPerson(person);
                setActiveIndex(i);
                setPhase('message');
              }}
              animate={{
                backgroundColor: isSelected ? '#f1f8f4' : '#ffffff',
              }}
              transition={{ duration: 0.3 }}
            >
              <div className={`nd-avatar avatar-${person.color}`}>
                {person.initials}
              </div>

              <div className="nd-person">
                <div>
                  <b>{person.name}</b>
                  <time>{person.time}</time>
                </div>

                <p>{person.msg}</p>

                {isSelected && phase === 'message' && (
                  <motion.span
                    className="nd-live-message"
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                  >
                    Active conversation
                  </motion.span>
                )}
              </div>
            </motion.button>
          );
        })}
      </section>

      {/* Conversation */}
      <section className="nd-thread">
        <header>
          <div className={`nd-avatar avatar-${active.color}`}>
            {active.initials}
          </div>

          <div>
            <b>{active.name}</b>

            <small>
              <i />
              Online · {active.channel}
            </small>
          </div>

          <MoreHorizontal size={18} />
        </header>

        <div className="nd-thread-meta">
          Today, {active.time}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={`${active.name}-${phase}`}
            className="nd-live-thread"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div className="nd-bubble incoming">
              {active.incoming}
              <small>{active.time}</small>
            </div>

            {phase === 'typing' && (
              <motion.div
                className="nd-typing"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <span />
                <span />
                <span />
                <em>AI is drafting a reply</em>
              </motion.div>
            )}

            {(phase === 'reply' || phase === 'assigned') && (
              <motion.div
                className="nd-bubble outgoing"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4 }}
              >
                {active.reply}
                <small>10:25 · ✓✓</small>
              </motion.div>
            )}

            {phase === 'assigned' && (
              <motion.div
                className="nd-assignment"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <span className="nd-assignment-dot" />
                Conversation assigned to <b>Daniel K</b>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="nd-compose">
          <span>
            {phase === 'typing'
              ? 'AI is preparing a response...'
              : `Reply to ${active.name}...`}
          </span>

          <motion.button
            aria-label="Send reply"
            animate={
              phase === 'typing'
                ? { scale: [1, 1.08, 1] }
                : { scale: 1 }
            }
            transition={{
              repeat: phase === 'typing' ? Infinity : 0,
              duration: 1,
            }}
          >
            <ArrowRight size={15} />
          </motion.button>
        </div>
      </section>

      {/* Contact / CRM context */}
      <aside className="nd-contact">
        <div className="nd-contact-top">
          <b>Contact details</b>
          <MoreHorizontal size={16} />
        </div>

        <div className="nd-profile">
          <div className={`nd-avatar avatar-${active.color} large`}>
            {active.initials}
          </div>

          <b>{active.name}</b>
          <span>Growth Lead</span>
        </div>

        {[
          ['Phone', '+265 99 123 4567'],
          [
            'Email',
            `${active.name
              .toLowerCase()
              .replace(' ', '.')}@example.com`,
          ],
          ['Source', active.source],
          ['Deal', active.deal],
          ['Stage', active.stage],
          ['Assigned to', 'Daniel K'],
        ].map(([key, value]) => (
          <motion.div
            className="nd-detail"
            key={key}
            layout
          >
            <small>{key}</small>
            <b>{value}</b>
          </motion.div>
        ))}

        <div className="nd-last">
          <i />
          Last activity · just now
        </div>
      </aside>
    </motion.div>
  );
}

function MiniPreview({ type }) {
  if (type === 'inbox') {
    return (
      <div className="mini mini-inbox">
        <div className="mini-toolbar">
          Inbox
          <span>All&nbsp; 42&nbsp;&nbsp; WhatsApp&nbsp; 28</span>
        </div>

        {people.slice(0, 3).map(
          ([initials, name, msg, , color]) => (
            <div className="mini-row" key={name}>
              <span className={`nd-avatar avatar-${color}`}>
                {initials}
              </span>

              <div>
                <b>{name}</b>
                <small>{msg}</small>
              </div>

              <i />
            </div>
          )
        )}
      </div>
    );
  }

  if (type === 'crm') {
    return (
      <div className="mini mini-crm">
        <div className="mini-toolbar">
          Contact details
          <span>•••</span>
        </div>

        <b>Sarah Chen</b>
        <small>Growth Lead · WhatsApp Ad</small>

        <div className="mini-fields">
          <span>
            Deal <b>Growth Plan</b>
          </span>

          <span>
            Stage <b className="pill-green">Proposal</b>
          </span>

          <span>
            Assigned <b>Daniel K</b>
          </span>
        </div>
      </div>
    );
  }

  if (type === 'ai') {
    return (
      <div className="mini mini-ai">
        <span className="ai-chip">
          <Bot size={15} />
          Sales Agent <i /> Online
        </span>

        <div className="mini-chat">
          Can you help me choose a plan?
        </div>

        <div className="mini-chat reply">
          Of course. How many people are on your team?
        </div>

        <small>
          Knowledge connected <b>4 sources</b>
        </small>
      </div>
    );
  }

  if (type === 'team') {
    return (
      <div className="mini mini-team">
        <div className="mini-toolbar">
          Team activity <span>Today</span>
        </div>

        {[
          ['DK', 'Daniel K', 'Assigned Sarah Chen', 'green'],
          ['AM', 'Amara Moyo', 'Replied to James', 'blue'],
          ['TN', 'Thoko N.', 'Online now', 'purple'],
        ].map((row) => (
          <div className="mini-row" key={row[0]}>
            <span className={`nd-avatar avatar-${row[3]}`}>
              {row[0]}
            </span>

            <div>
              <b>{row[1]}</b>
              <small>{row[2]}</small>
            </div>

            <i />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'campaign') {
    return (
      <div className="mini mini-campaign">
        <div className="campaign-head">
          <span>October Growth Offer</span>
          <b>Sent</b>
        </div>

        <div className="campaign-bars">
          {[
            ['Sent', '4,280', 100],
            ['Delivered', '4,121', 92],
            ['Read', '3,684', 78],
            ['Replies', '428', 36],
          ].map((item) => (
            <div key={item[0]}>
              <span>
                {item[0]}
                <b>{item[1]}</b>
              </span>

              <i>
                <em style={{ width: `${item[2]}%` }} />
              </i>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mini mini-sla">
      <div className="mini-toolbar">
        Response times <span>Live</span>
      </div>

      {[
        ['Sarah Chen', '01:42', 'green'],
        ['James Okafor', '05:18', 'green'],
        ['Priya Nair', '12:03', 'orange'],
      ].map((row) => (
        <div className="sla-row" key={row[0]}>
          <span className={`nd-avatar avatar-${row[2]}`}>
            {row[0]
              .split(' ')
              .map((part) => part[0])
              .join('')}
          </span>

          <b>{row[0]}</b>
          <time className={row[2]}>{row[1]}</time>
        </div>
      ))}
    </div>
  );
}

export default function Landing() {
  const [selectedChannel, setSelectedChannel] =
    useState('WhatsApp');

  return (
    <MarketingLayout
      title="Turn every conversation into a sale"
      className="marketing-light"
    >
      <div className="landing-redesign">

        {/* ───────────────── HERO ───────────────── */}

        <section className="nd-hero">
          <div className="nd-container nd-hero-inner">

            <div className="nd-hero-copy">
              <div className="nd-badge">
                <span />
                WhatsApp + 5 channels
              </div>

              <h1>
                Turn every
                <br />
                conversation
                <br />
                <em>into a sale.</em>
              </h1>

              <p>
                One workspace for WhatsApp, Instagram, Messenger, Telegram,
                email and website chat — with your team, CRM and AI agents
                working together.
              </p>

              <div className="nd-hero-actions">
                <Link
                  className="nd-button primary"
                  to="/register"
                >
                  Start for free
                  <ArrowRight size={17} />
                </Link>

                <a
                  className="nd-button secondary"
                  href="#how-it-works"
                >
                  See how it works
                  <ArrowDown size={15} />
                </a>
              </div>

              <div className="nd-reassurance">
                <span>
                  <Check />
                  No credit card required
                </span>

                <span>
                  <Check />
                  Built for growing teams
                </span>

                <span>
                  <Check />
                  Setup in minutes
                </span>
              </div>
            </div>

            <div className="nd-hero-product">
              <div className="nd-product-label">
                <span className="pulse-dot" />
                Your shared inbox
                <span className="label-live">
                  LIVE PREVIEW
                </span>
              </div>

              <DashboardPreview
                selectedChannel={selectedChannel}
              />
            </div>

          </div>
        </section>

        {/* ───────────────── CHANNELS ───────────────── */}

        <section
          className="nd-channel-stats"
          id="channels"
        >
          <div className="nd-container nd-channel-row">

            <div
              className="nd-channels"
              role="tablist"
              aria-label="Connected channels"
            >
              {channels.map(
                ({ name, icon: Icon, color }) => {
                  const isActive =
                    selectedChannel === name;

                  return (
                    <button
                      type="button"
                      key={name}
                      className={`nd-channel ${
                        isActive ? 'active' : ''
                      }`}
                      onClick={() =>
                        setSelectedChannel(name)
                      }
                      role="tab"
                      aria-selected={isActive}
                    >
                      <span style={{ color }}>
                        <Icon size={19} />
                      </span>

                      {name}
                    </button>
                  );
                }
              )}
            </div>

            <div className="nd-stats">
              <div>
                <b>All in one</b>
                <span>connected workspace</span>
              </div>

              <div>
                <b>One team</b>
                <span>shared customer context</span>
              </div>

              <div>
                <b>One flow</b>
                <span>from message to sale</span>
              </div>
            </div>

          </div>
        </section>

        {/* ───────────────── HOW IT WORKS ───────────────── */}

        <section
          className="nd-section nd-how"
          id="sales-flow"
        >
          <div className="nd-container">

            <div
              className="nd-section-heading"
              id="how-it-works"
            >
              <span className="nd-eyebrow">
                HOW IT WORKS
              </span>

              <h2>
                From message to customer — in one flow.
              </h2>

              <p>
                NyasaDesk helps your team capture, route, respond,
                qualify and close more sales.
              </p>
            </div>

            <div className="nd-steps">
              {steps.map(
                ([number, title, desc], i) => (
                  <article
                    className="nd-step"
                    key={number}
                  >
                    <div className="nd-step-number">
                      {number}
                    </div>

                    <div className="nd-step-icon">
                      {
                        [
                          <MessageCircle key="capture" />,
                          <Users key="route" />,
                          <Zap key="respond" />,
                          <ContactRound key="qualify" />,
                          <ArrowUpRight key="close" />,
                        ][i]
                      }
                    </div>

                    <h3>{title}</h3>

                    <p>{desc}</p>

                    {i < steps.length - 1 && (
                      <ChevronRight
                        className="step-arrow"
                        size={20}
                      />
                    )}
                  </article>
                )
              )}
            </div>

          </div>
        </section>

        {/* ───────────────── WORKSPACE ───────────────── */}

        <section
          className="nd-section nd-workspace"
          id="product"
        >
          <div className="nd-container">

            <div className="nd-section-heading">
              <span className="nd-eyebrow">
                ONE CONNECTED WORKSPACE
              </span>

              <h2>
                A complete workspace for modern sales teams.
              </h2>

              <p>
                Every tool your team needs, connected to the same
                customer conversation.
              </p>
            </div>

            <div className="nd-feature-grid">
              {features.map(
                ({
                  icon: Icon,
                  name,
                  desc,
                  type,
                }) => (
                  <article
                    className="nd-feature-card"
                    key={name}
                  >
                    <div className="nd-feature-copy">

                      <div className="nd-feature-icon">
                        <Icon size={17} />
                      </div>

                      <h3>{name}</h3>

                      <p>{desc}</p>

                      <a href="#pricing">
                        Explore {name.toLowerCase()}
                        <ArrowRight size={14} />
                      </a>

                    </div>

                    <MiniPreview type={type} />
                  </article>
                )
              )}
            </div>

          </div>
        </section>

        {/* ───────────────── AI ───────────────── */}

        <section
          className="nd-ai-section"
          id="ai-agents"
        >
          <div className="nd-container nd-ai-inner">

            <div className="nd-ai-copy">
              <span className="nd-eyebrow">
                AI THAT WORKS WITH YOUR TEAM
              </span>

              <h2>
                Your team gets an
                <br />
                AI teammate.
              </h2>

              <p>
                Train AI agents on your company documents, product
                catalogue and website. Let them handle common questions,
                qualify leads and hand conversations to humans when needed.
              </p>

              <ul>
                <li>
                  <Check />
                  Answers with your business knowledge
                </li>

                <li>
                  <Check />
                  Qualifies leads and recommends next steps
                </li>

                <li>
                  <Check />
                  Hands off to a person whenever needed
                </li>
              </ul>

              <Link
                className="nd-text-link"
                to="/features/whatsapp-chatbots"
              >
                Learn about AI agents
                <ArrowRight size={15} />
              </Link>
            </div>

            <div className="nd-ai-panel">

              <div className="ai-panel-head">
                <div className="ai-icon">
                  <Bot />
                </div>

                <div>
                  <b>Sales Agent</b>

                  <small>
                    <i />
                    Online · AI Agent
                  </small>
                </div>

                <span>•••</span>
              </div>

              <div className="ai-panel-content">

                <div className="ai-flow">

                  <div>
                    <span className="flow-icon customer">
                      <MessageCircle size={16} />
                    </span>

                    <p>
                      <b>Customer asks</b>

                      <small>
                        “Do you have a plan for my team?”
                      </small>
                    </p>
                  </div>

                  <ArrowDown />

                  <div>
                    <span className="flow-icon">
                      <Bot size={16} />
                    </span>

                    <p>
                      <b>AI responds & qualifies</b>

                      <small>
                        Shares a relevant answer and captures intent
                      </small>
                    </p>
                  </div>

                  <ArrowDown />

                  <div>
                    <span className="flow-icon person">
                      <Users size={16} />
                    </span>

                    <p>
                      <b>Human takes over</b>

                      <small>
                        When a personal touch is needed
                      </small>
                    </p>
                  </div>

                </div>

                <div className="knowledge-box">
                  <b>Knowledge sources</b>

                  <span>
                    <Check />
                    Pricing & FAQs
                  </span>

                  <span>
                    <Check />
                    Product catalogue
                  </span>

                  <span className="handoff-on">
                    Human handoff <b>ON</b>
                  </span>
                </div>

              </div>
            </div>

          </div>
        </section>

        {/* ───────────────── CRM ───────────────── */}

        <section className="nd-crm-section">
          <div className="nd-container nd-crm-inner">

            <div className="nd-crm-copy">
              <span className="nd-eyebrow">
                CONVERSATION + CUSTOMER CONTEXT
              </span>

              <h2>
                Your inbox is connected to your sales pipeline.
              </h2>

              <p>
                Understand who you’re talking to, where they came from
                and what should happen next — without leaving the conversation.
              </p>

              <div className="nd-pipeline">
                {[
                  'New',
                  'Qualified',
                  'Proposal',
                  'Won',
                ].map((stage, i) => (
                  <div
                    className={i === 2 ? 'current' : ''}
                    key={stage}
                  >
                    <i />
                    {stage}

                    {i < 3 && (
                      <ArrowRight />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="crm-preview">

              <div className="crm-chat">

                <div className="crm-top">
                  <b>Sarah Chen</b>
                  <small>WhatsApp · Today</small>
                </div>

                <div className="crm-message">
                  Hi, I’m interested in the Growth plan for my team.
                </div>

                <div className="crm-message sent">
                  Absolutely — happy to help. How many people are on your team?
                </div>

                <div className="crm-input">
                  Reply to Sarah...
                  <ArrowRight size={15} />
                </div>

              </div>

              <div className="crm-info">

                <div className="crm-profile">
                  <span className="nd-avatar avatar-green large">
                    SC
                  </span>

                  <b>Sarah Chen</b>
                  <small>Growth Lead</small>
                </div>

                {[
                  ['Phone', '+265 99 123 4567'],
                  ['Email', 'sarah@example.com'],
                  ['Source', 'WhatsApp Ad'],
                  ['Deal', 'Growth Plan · K50,000'],
                  ['Stage', 'Proposal'],
                  ['Assigned to', 'Daniel K'],
                ].map(([key, value]) => (
                  <div
                    className="crm-detail"
                    key={key}
                  >
                    <span>{key}</span>
                    <b>{value}</b>
                  </div>
                ))}

              </div>

            </div>

          </div>
        </section>

        {/* ───────────────── PROOF ───────────────── */}

        <section className="nd-section nd-proof">
          <div className="nd-container">

            <div className="nd-proof-grid">

              <article>
                <span className="nd-eyebrow">
                  BROADCASTS
                </span>

                <h2>
                  Reach customers.
                  <br />
                  Keep the conversation.
                </h2>

                <p>
                  Send WhatsApp template broadcasts and see what happens next.
                </p>

                <MiniPreview type="campaign" />
              </article>

              <article>
                <span className="nd-eyebrow">
                  SLA TRACKING
                </span>

                <h2>
                  Never leave a customer waiting.
                </h2>

                <p>
                  Give your team clear response targets and spot
                  conversations that need attention.
                </p>

                <MiniPreview type="sla" />
              </article>

            </div>

          </div>
        </section>

        {/* ───────────────── PRICING ───────────────── */}

        <section
          className="nd-section nd-pricing"
          id="pricing"
        >
          <div className="nd-container nd-pricing-inner">

            <div>
              <span className="nd-eyebrow">
                PLANS FOR EVERY TEAM
              </span>

              <h2>
                Simple, transparent pricing.
              </h2>

              <p>
                Start with the essentials and add more capacity as your team grows.
              </p>

              <Link
                className="nd-text-link"
                to="/pricing"
              >
                Compare all plans
                <ArrowRight size={15} />
              </Link>
            </div>

            <div className="nd-price-cards">

              <div>
                <span>STARTER</span>

                <b>
                  K25,000
                  <small>/month</small>
                </b>

                <p>
                  For small teams getting started.
                </p>
              </div>

              <div className="featured">
                <span>
                  GROWTH
                  <i>MOST POPULAR</i>
                </span>

                <b>
                  K50,000
                  <small>/month</small>
                </b>

                <p>
                  For teams ready to grow together.
                </p>
              </div>

              <div>
                <span>SCALE</span>

                <b>
                  K120,000
                  <small>/month</small>
                </b>

                <p>
                  For larger teams and advanced needs.
                </p>
              </div>

            </div>

          </div>
        </section>

        {/* ───────────────── FINAL CTA ───────────────── */}

        <section className="nd-final-cta">
          <div className="nd-container">

            <div>
              <span className="nd-eyebrow">
                START A BETTER CONVERSATION
              </span>

              <h2>
                Ready to turn more conversations into sales?
              </h2>

              <p>
                Bring your team, customers and AI agents into one workspace.
              </p>
            </div>

            <div className="nd-hero-actions">

              <Link
                className="nd-button primary"
                to="/register"
              >
                Start for free
                <ArrowRight size={17} />
              </Link>

              <Link
                className="nd-button secondary"
                to="/features/omnichannel"
              >
                Talk to sales
                <ArrowRight size={15} />
              </Link>

            </div>

          </div>
        </section>

      </div>
    </MarketingLayout>
  );
}