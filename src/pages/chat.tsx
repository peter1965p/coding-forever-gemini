import React, { useState, useEffect, useRef } from 'react';
import { SquarePen, LayoutDashboard, Settings, History, Trash2, Copy, Download, Check } from 'lucide-react';
import { PrismAsyncLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';

SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('html', markup);
SyntaxHighlighter.registerLanguage('markup', markup);
SyntaxHighlighter.registerLanguage('yaml', yaml);

// Mappt lockere/alternative Sprachnamen (z.B. aus ```-Fences oder guessLanguage) auf registrierte Prism-Keys
const LANG_ALIAS: Record<string, string> = {
  ts: 'typescript', js: 'javascript', py: 'python', sh: 'bash', shell: 'bash',
  yml: 'yaml', text: 'text', txt: 'text'
};
function resolvePrismLang(lang: string): string {
  const key = lang.toLowerCase();
  return LANG_ALIAS[key] || key;
}
import { vscode } from '../lib/vscodeApi';

interface MessageItem {
  id?: string;
  sender: 'user' | 'assistant' | 'status';
  text: string;
  createdAt?: string;
}

interface ChatSessionItem {
  id: string;
  title: string;
  workspace: string;
  is_open: number;
  created_at?: string;
  updated_at?: string;
}

interface PromptBlock {
  id: string;
  label: string;
  category: string;
  description: string;
  prompt: string;
  scope: 'global' | 'workspace';
}

interface ChatProps {
  extName?: string;
  extVersion?: string;
  userName?: string;
  onNavigate?: (route: string) => void;
  onNewChat?: () => void;
}

const LANG_EXT_MAP: Record<string, string> = {
  typescript: 'ts', ts: 'ts', tsx: 'tsx', javascript: 'js', js: 'js', jsx: 'jsx',
  python: 'py', py: 'py', json: 'json', html: 'html', css: 'css',
  bash: 'sh', sh: 'sh', shell: 'sh', sql: 'sql', yaml: 'yml', yml: 'yml', text: 'txt'
};

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#8b949e',
  cursor: 'pointer',
  padding: '3px',
  display: 'flex',
  alignItems: 'center',
  borderRadius: '4px'
};

/**
 * Code-Block mit Sprach-Label + Copy/Download — wie bei Claude/Gemini,
 * statt nackten <pre>-Text.
 */
const CodeBlock: React.FC<{ code: string; lang: string }> = ({ code, lang }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => { /* Clipboard-Zugriff kann im Webview-Kontext fehlschlagen — dann still ignorieren */ });
  };

  const handleDownload = () => {
    const ext = LANG_EXT_MAP[lang.toLowerCase()] || 'txt';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snippet.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#0d1117', borderBottom: '1px solid #30363d' }}>
        <span style={{ fontSize: '11px', color: '#8b949e', fontFamily: 'monospace' }}>{lang}</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={handleDownload} title="Herunterladen" style={iconBtnStyle}><Download size={12} /></button>
          <button onClick={handleCopy} title="Kopieren" style={iconBtnStyle}>
            {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        language={resolvePrismLang(lang)}
        style={vscDarkPlus}
        customStyle={{ margin: 0, padding: '10px', fontSize: '11px', background: 'transparent', maxHeight: '400px', overflowX: 'auto' }}
        codeTagProps={{ style: { fontFamily: 'monospace' } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

// Erkennt, ob ein NICHT gefenceter Text (kein ```-Block) trotzdem Code ist —
// z.B. wenn jemand rohen Code ohne Markdown-Fence in den Chat pastet.
function looksLikeCode(text: string): boolean {
  if (text.includes('```')) { return false; }
  const lines = text.split('\n');
  if (lines.length < 2) { return false; }
  const codeIndicators = /(=>|;\s*$|^\s*(const|let|var|function|import|export|class|def |public |private |#include)\b|<\/?[a-zA-Z][^>]*>|^\s*[{}]\s*$)/;
  const matchCount = lines.filter(l => codeIndicators.test(l)).length;
  return matchCount >= Math.max(2, Math.floor(lines.length * 0.3));
}

function guessLanguage(text: string): string {
  if (/<[a-zA-Z][\w-]*[\s/>]/.test(text) && /(style=\{\{|className=)/.test(text)) { return 'tsx'; }
  if (/^\s*(import|export)\s/m.test(text) && /:\s*(string|number|boolean)/.test(text)) { return 'typescript'; }
  if (/^\s*(import|export|const|let|function)\s/m.test(text)) { return 'javascript'; }
  if (/^\s*def\s|^\s*class\s.*:\s*$/m.test(text)) { return 'python'; }
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE)\s/im.test(text)) { return 'sql'; }
  if (/^\s*\{[\s\S]*\}\s*$/.test(text.trim())) { return 'json'; }
  return 'text';
}

/**
 * Hilfsfunktion zur Formatierung strukturierter Ausgaben
 */
const renderStructuredMessage = (text: string) => {
  // Ungefenceter Code-Paste (kein ``` im Text, sieht aber nach Code aus) —
  // ganze Nachricht als einen Block behandeln statt zeilenweise zu zerreißen.
  if (looksLikeCode(text)) {
    return <CodeBlock code={text.trim()} lang={guessLanguage(text)} />;
  }

  // Markdown-ähnliche Syntax unterstützen
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headings (# ## ###)
    if (line.startsWith('###')) {
      elements.push(
        <h3 key={`h3-${i}`} style={{ fontSize: '13px', fontWeight: 'bold', color: '#fbbf24', marginTop: '8px', marginBottom: '4px' }}>
          {line.replace(/^#+\s*/, '')}
        </h3>
      );
    } else if (line.startsWith('##')) {
      elements.push(
        <h2 key={`h2-${i}`} style={{ fontSize: '14px', fontWeight: 'bold', color: '#f97316', marginTop: '10px', marginBottom: '6px' }}>
          {line.replace(/^#+\s*/, '')}
        </h2>
      );
    } else if (line.startsWith('#')) {
      elements.push(
        <h1 key={`h1-${i}`} style={{ fontSize: '15px', fontWeight: 'bold', color: '#ff6200', marginTop: '12px', marginBottom: '8px' }}>
          {line.replace(/^#+\s*/, '')}
        </h1>
      );
    }
    // Code-Blöcke
    else if (line.startsWith('```')) {
      let codeBlock = '';
      const lang = line.replace(/^```/, '').trim() || 'text';
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeBlock += lines[i] + '\n';
        i++;
      }
      elements.push(
        <CodeBlock key={`code-${i}`} code={codeBlock.trim()} lang={lang} />
      );
    }
    // Listen
    else if (line.match(/^\s*[-*•]\s/)) {
      elements.push(
        <div key={`list-${i}`} style={{ marginLeft: '8px', fontSize: '12px', lineHeight: '1.6' }}>
          {line.replace(/^\s*[-*•]\s/, '• ')}
        </div>
      );
    }
    // Normale Absätze
    else if (line.trim()) {
      elements.push(
        <div key={`text-${i}`} style={{ fontSize: '12px', lineHeight: '1.6', marginTop: '4px' }}>
          {line}
        </div>
      );
    }
  }

  return elements.length > 0 ? elements : <div>{text}</div>;
};

export const Chat: React.FC<ChatProps> = ({ extName = 'Coding Forever', userName }) => {
  const dynamicName = userName || '';
  const greetingName = dynamicName ? ` ${dynamicName}` : '';

  // State
  const [agentMode, setAgentMode] = useState(true);
  const [bypass, setBypass] = useState(true);
  const [autoAccept, setAutoAccept] = useState(true);
  const [selectedModel, setSelectedModel] = useState('gemini-3.6-flash');
  const [inputText, setInputText] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([
    { sender: 'assistant', text: `Moin${greetingName}! ${extName} ist bereit. Wie kann ich dir heute helfen? 🚀` }
  ]);
  const [prompts, setPrompts] = useState<PromptBlock[]>([]);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionItem[]>([]);
  const [groqModels, setGroqModels] = useState<string[]>([]);
  const [groqKeySet, setGroqKeySet] = useState<boolean>(
    Boolean((window as any).INITIAL_AI_SETTINGS?.groqApiKey)
  );
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [localEnabled, setLocalEnabled] = useState<boolean>(
    Boolean((window as any).INITIAL_AI_SETTINGS?.localEnabled)
  );
  const [localBaseUrl, setLocalBaseUrl] = useState<string>(
    (window as any).INITIAL_AI_SETTINGS?.baseUrl || 'http://localhost:11434'
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const postToVsCode = (payload: any) => {
    vscode.postMessage(payload);
  };

  // Direkter Client-Fetch gegen Ollama (CSP erlaubt http://localhost:* explizit) —
  // gleicher Ansatz wie in AiSettings.tsx, kein Umweg über die Extension nötig.
  const fetchLocalModels = async (baseUrl: string) => {
    try {
      const cleanUrl = baseUrl.replace(/\/v1\/?$/, '');
      const res = await fetch(`${cleanUrl}/api/tags`);
      const data = await res.json();
      const names: string[] = (data?.models || []).map((m: any) => m.name);
      setLocalModels(names);
    } catch {
      setLocalModels([]);
    }
  };

  // Auto-scroll zu neuesten Nachrichten
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialisierung
  useEffect(() => {
    // Session laden/erstellen
    postToVsCode({ type: 'initializeSession' });

    // Prompts laden
    postToVsCode({ type: 'getPrompts' });

    // History laden
    postToVsCode({ type: 'loadHistory' });

    // Verfügbare Groq-Modelle live laden (falls ein Key hinterlegt ist)
    postToVsCode({ type: 'getGroqModels' });

    // Verfügbare lokale Ollama-Modelle laden (falls "Lokale Modelle" aktiv ist)
    if (localEnabled) {
      fetchLocalModels(localBaseUrl);
    }

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      if (message.type === 'toggleHistory') {
        setShowHistory((prev) => !prev);
      } else if (message.type === 'setPrompt') {
        setInputText(message.value);
      } else if (message.type === 'loadPrompts' || message.type === 'setPrompts' || message.type === 'promptsLoaded') {
        const receivedPrompts = message.prompts || message.value || message.data || [];
        setPrompts(receivedPrompts);
      } else if (message.type === 'sessionInitialized') {
        setCurrentSessionId(message.sessionId);
      } else if (message.type === 'historyLoaded') {
        setSessions(message.sessions || []);
      } else if (message.type === 'response' || message.type === 'chatResponse') {
        const assistantMsg: MessageItem = {
          id: `msg_${Date.now()}`,
          sender: 'assistant',
          text: message.text || message.value
        };
        setMessages((prev) => [...prev, assistantMsg]);
        // Nachricht in DB speichern
        if (currentSessionId) {
          postToVsCode({
            type: 'saveMessage',
            sessionId: currentSessionId,
            sender: 'assistant',
            text: assistantMsg.text
          });
        }
      } else if (message.type === 'status') {
        setMessages((prev) => [...prev, { sender: 'status', text: message.text }]);
      } else if (message.type === 'sessionLoaded') {
        setMessages(message.messages || []);
      } else if (message.type === 'groqModelsLoaded') {
        const ids: string[] = (message.models || []).map((m: any) => (typeof m === 'string' ? m : m.id));
        setGroqModels(ids);
        if (ids.length > 0) {
          setGroqKeySet(true);
        }
      } else if (message.type === 'aiSettingsUpdated') {
        const hasKey = Boolean(message.settings?.groqApiKey);
        setGroqKeySet(hasKey);
        if (hasKey) {
          postToVsCode({ type: 'getGroqModels' });
        } else {
          setGroqModels([]);
        }

        const nowLocalEnabled = Boolean(message.settings?.localEnabled);
        const nowBaseUrl = message.settings?.baseUrl || 'http://localhost:11434';
        setLocalEnabled(nowLocalEnabled);
        setLocalBaseUrl(nowBaseUrl);
        if (nowLocalEnabled) {
          fetchLocalModels(nowBaseUrl);
        } else {
          setLocalModels([]);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [currentSessionId]);

  const sendPrompt = (text: string) => {
    if (!text.trim()) return;

    const userMsg: MessageItem = {
      id: `msg_${Date.now()}`,
      sender: 'user',
      text
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setSlashQuery(null);

    // Nachricht speichern
    if (currentSessionId) {
      postToVsCode({
        type: 'saveMessage',
        sessionId: currentSessionId,
        sender: 'user',
        text
      });
    }

    // Chat absenden
    postToVsCode({
      type: 'runChat',
      prompt: text,
      model: selectedModel,
      agentMode: agentMode,
      bypass: bypass,
      autoAccept: autoAccept
    });
  };

  const handleSendMessage = () => sendPrompt(inputText);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    if (val.startsWith('/')) {
      setSlashQuery(val.slice(1));
    } else {
      const slashMatch = val.match(/(?:^|\s)\/(\S*)$/);
      setSlashQuery(slashMatch ? slashMatch[1] : null);
    }
  };

  const filteredPrompts = slashQuery !== null
    ? prompts.filter(
        (p) =>
          (p.label && p.label.toLowerCase().includes(slashQuery.toLowerCase())) ||
          (p.category && p.category.toLowerCase().includes(slashQuery.toLowerCase())) ||
          (p.description && p.description.toLowerCase().includes(slashQuery.toLowerCase()))
      )
    : [];

  const pickSlashPrompt = (p: PromptBlock) => {
    setInputText(p.prompt);
    setSlashQuery(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
    if (e.key === 'Escape') {
      setSlashQuery(null);
    }
  };

  const handleNewChat = () => {
    setMessages([{ sender: 'assistant', text: `Neuer Chat gestartet. Was soll heute gebaut werden?` }]);
    setCurrentSessionId(null);
    postToVsCode({ type: 'newChat' });
  };

  const handleLoadSession = (session: ChatSessionItem) => {
    setCurrentSessionId(session.id);
    postToVsCode({ type: 'loadSession', sessionId: session.id });
    setShowHistory(false);
  };

  const handleDeleteSession = (sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    postToVsCode({ type: 'deleteSession', sessionId });
  };

  const triggerCodeDiff = (rawText: string) => {
    const codeMatch = rawText.match(/```(?:\w+)?\n([\s\S]*?)```/);
    const cleanCode = codeMatch ? codeMatch[1] : rawText;
    postToVsCode({ type: 'showDiff', code: cleanCode });
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Heute';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 60) return `vor ${diffMins}min`;
      if (diffHours < 24) return `vor ${diffHours}h`;
      if (diffDays < 7) return `vor ${diffDays}d`;
      return date.toLocaleDateString('de-DE');
    } catch {
      return 'Heute';
    }
  };

  return (
    <div
      style={{
        fontFamily: 'var(--vscode-font-family, sans-serif)',
        backgroundColor: '#0b0f19',
        color: '#f9fafb',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        boxSizing: 'border-box',
        position: 'relative'
      }}
    >
      <style>{`
        .switch {
          position: relative;
          display: inline-block;
          width: 36px;
          height: 20px;
        }
        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: #374151;
          transition: .2s;
          border-radius: 20px;
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 14px;
          width: 14px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .2s;
          border-radius: 50%;
        }
        .switch input:checked + .slider {
          background-color: #ff6200;
        }
        .switch input:checked + .slider:before {
          transform: translateX(16px);
        }
        .icon-btn {
          background: transparent;
          border: 1px solid #1f2937;
          color: #9ca3af;
          border-radius: 4px;
          cursor: pointer;
          padding: 4px 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s, color 0.2s;
        }
        .icon-btn:hover {
          background: #1e293b;
          color: #ff6200;
        }
        .history-item {
          padding: 10px;
          margin-bottom: 8px;
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
        }
        .history-item:hover {
          background: #334155;
          border-color: #ff6200;
        }
      `}</style>

      {/* History Drawer */}
      {showHistory && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '280px',
            height: '100%',
            backgroundColor: '#0f172a',
            zIndex: 100,
            borderLeft: '1px solid #334155',
            padding: '16px',
            boxShadow: '-4px 0 15px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontWeight: 'bold', color: '#e2e8f0', fontSize: '13px' }}>📋 Chat-Verlauf</span>
            <button
              onClick={() => setShowHistory(false)}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px' }}
            >
              ✕
            </button>
          </div>

          {sessions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="history-item"
                  onClick={() => handleLoadSession(session)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: '500', color: '#e2e8f0', marginBottom: '4px' }}>
                      {session.title}
                    </div>
                    <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                      {formatDate(session.updated_at)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(session.id);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      padding: '4px'
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', marginTop: '24px' }}>
              Keine Chat-History vorhanden
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #1f2937',
          fontSize: '12px',
          fontWeight: 'bold',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#111827',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={handleNewChat} className="icon-btn" title="Neuer Chat">
            <SquarePen size={15} />
          </button>
          <button onClick={() => postToVsCode({ type: 'openDashboard' })} className="icon-btn" title="Dashboard">
            <LayoutDashboard size={15} />
          </button>
          <button onClick={() => postToVsCode({ type: 'openSettings' })} className="icon-btn" title="Einstellungen">
            <Settings size={15} />
          </button>
          <button onClick={() => setShowHistory(!showHistory)} className="icon-btn" title="Verlauf">
            <History size={15} />
          </button>

          <span
            style={{
              position: 'relative',
              backgroundImage: 'linear-gradient(to bottom, #fed7aa, #f97316, #431407)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textTransform: 'uppercase',
              marginLeft: '6px'
            }}
          >
            Agentic Chat
          </span>
        </div>

        <div style={{ display: 'flex', gap: '6px', fontSize: '10px' }}>
          <span style={{ color: agentMode ? '#0fff06' : '#ef4444' }}>Agent [{agentMode ? 'ON' : 'OFF'}]</span>
          <span style={{ color: bypass ? '#0fff06' : '#ef4444' }}>Bypass [{bypass ? 'ON' : 'OFF'}]</span>
          <span style={{ color: autoAccept ? '#0fff06' : '#ef4444' }}>Accept [{autoAccept ? 'ON' : 'OFF'}]</span>
        </div>
      </div>

      {/* Chat Messages */}
      <div
        style={{
          flex: 1,
          padding: '14px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        {messages.map((msg, idx) => {
          if (msg.sender === 'status') {
            return (
              <div key={idx} style={{ fontSize: '11px', color: '#9ca3af', fontStyle: 'italic', alignSelf: 'flex-start' }}>
                ℹ️ {msg.text}
              </div>
            );
          }

          const containsCode = msg.text.includes('```');

          return (
            <div
              key={idx}
              style={{
                padding: '12px',
                borderRadius: '8px',
                maxWidth: '85%',
                wordBreak: 'break-word',
                alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                backgroundColor: msg.sender === 'user' ? '#1e293b' : '#1a1f2e',
                border: `1px solid ${msg.sender === 'user' ? '#334155' : '#374151'}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              {renderStructuredMessage(msg.text)}

              {msg.sender === 'assistant' && containsCode && (
                <button
                  onClick={() => triggerCodeDiff(msg.text)}
                  style={{
                    alignSelf: 'flex-start',
                    background: '#ff6200',
                    border: 'none',
                    color: '#fefefe',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    cursor: 'pointer',
                    marginTop: '4px',
                    fontWeight: 'bold'
                  }}
                >
                  🔍 Diff vergleichen
                </button>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Section */}
      <div
        style={{
          padding: '10px 14px',
          backgroundColor: '#111827',
          borderTop: '1px solid #1f2937',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          position: 'relative',
          flexShrink: 0
        }}
      >
        {/* Slash Prompts Dropdown */}
        {slashQuery !== null && filteredPrompts.length > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '14px',
              right: '14px',
              marginBottom: '4px',
              background: '#1e293b',
              border: '1px solid #ff6200',
              borderRadius: '6px',
              maxHeight: '200px',
              overflowY: 'auto',
              zIndex: 10,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}
          >
            {filteredPrompts.map((p) => (
              <div
                key={p.id || p.label}
                onClick={() => pickSlashPrompt(p)}
                style={{
                  padding: '8px 10px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #374151',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#334155')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <strong style={{ color: '#ff6200' }}>{p.label}</strong>
                <div style={{ color: '#9ca3af', fontSize: '10px' }}>
                  {p.category} — {p.description}
                </div>
              </div>
            ))}
          </div>
        )}

        <textarea
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Was soll gebaut werden? ('/' für gespeicherte Prompts, Enter zum Senden, Shift+Enter für Zeilenumbruch)"
          style={{
            width: '100%',
            background: '#0b0f19',
            border: '1px solid #1f2937',
            color: '#fff',
            padding: '8px',
            borderRadius: '6px',
            fontSize: '12px',
            resize: 'none',
            height: '48px',
            boxSizing: 'border-box',
            fontFamily: 'inherit'
          }}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap'
          }}
        >
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            style={{
              background: '#0b0f19',
              border: '1px solid #1f2937',
              color: '#f9fafb',
              padding: '4px 6px',
              borderRadius: '4px',
              fontSize: '11px'
            }}
          >
            <optgroup label="Gemini">
              <option value="gemini-3.6-flash">gemini-3.6-flash</option>
              <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite</option>
            </optgroup>

            <optgroup label={groqKeySet ? '⚡ Groq' : '⚡ Groq (kein API-Key)'}>
              {groqModels.length > 0 ? (
                groqModels.map((id) => (
                  <option key={id} value={`groq:${id}`}>
                    {id}{id.startsWith('groq/compound') ? ' (nur eingebaute Tools)' : ''}
                  </option>
                ))
              ) : (
                <option value="" disabled>
                  {groqKeySet ? 'Lade Groq-Modelle...' : 'Key unter AI Engine hinterlegen'}
                </option>
              )}
            </optgroup>

            <optgroup label={localEnabled ? '🖥️ Lokal (Ollama)' : '🖥️ Lokal (deaktiviert)'}>
              {localModels.length > 0 ? (
                localModels.map((id) => (
                  <option key={id} value={`local:${id}`}>
                    {id}
                  </option>
                ))
              ) : (
                <option value="" disabled>
                  {localEnabled ? 'Keine lokalen Modelle gefunden' : 'Unter AI Engine aktivieren'}
                </option>
              )}
            </optgroup>
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#9ca3af' }}>
              <label className="switch">
                <input type="checkbox" checked={agentMode} onChange={(e) => setAgentMode(e.target.checked)} />
                <span className="slider"></span>
              </label>
              <span>Agent</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#9ca3af' }}>
              <label className="switch">
                <input type="checkbox" checked={bypass} onChange={(e) => setBypass(e.target.checked)} />
                <span className="slider"></span>
              </label>
              <span>Bypass</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#9ca3af' }}>
              <label className="switch">
                <input type="checkbox" checked={autoAccept} onChange={(e) => setAutoAccept(e.target.checked)} />
                <span className="slider"></span>
              </label>
              <span>Accept All</span>
            </div>
          </div>

          <button
            onClick={handleSendMessage}
            style={{
              background: '#ff6200',
              color: '#fefefe',
              border: 'none',
              padding: '6px 14px',
              fontWeight: 'bold',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#ea580c')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#ff6200')}
          >
            Senden
          </button>
        </div>
      </div>
    </div>
  );
};