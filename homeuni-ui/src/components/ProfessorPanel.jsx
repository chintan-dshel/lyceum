import { useState, useRef, useEffect, useCallback } from 'react';
import { useProfessorChat } from '../hooks/useLesson.js';
import { useVoice } from '../hooks/useVoice.js';

export default function ProfessorPanel({ lessonId, lessonTitle }) {
  const { messages, loading, sending, streamingMessage, sendMessage, reportStruggling } = useProfessorChat(lessonId);
  const [input, setInput] = useState('');
  const [voiceMode, setVoiceMode] = useState(false);
  const bottomRef = useRef(null);
  const prevMessageCountRef = useRef(0);

  // Voice: transcript updates the input field; final transcript auto-submits
  const handleTranscript = useCallback((text, isFinal) => {
    setInput(text);
    if (isFinal) {
      // Small delay so the user sees the final transcript before it clears
      setTimeout(() => {
        if (text.trim()) {
          sendMessage(text.trim());
          setInput('');
        }
      }, 200);
    }
  }, [sendMessage]);

  const { supported: voiceSupported, listening, startListening, stopListening, speak, cancelSpeech } = useVoice({
    onTranscript: handleTranscript,
    voiceMode,
  });

  // Speak new assistant messages when voice mode is on
  useEffect(() => {
    const count = messages.length;
    if (voiceMode && count > prevMessageCountRef.current) {
      const last = messages[count - 1];
      if (last?.role === 'assistant') speak(last.content);
    }
    prevMessageCountRef.current = count;
  }, [messages, voiceMode, speak]);

  // Speak streaming message when it completes (streamingMessage → null transition)
  const prevStreamingRef = useRef(null);
  useEffect(() => {
    if (voiceMode && prevStreamingRef.current && !streamingMessage) {
      speak(prevStreamingRef.current);
    }
    prevStreamingRef.current = streamingMessage;
  }, [streamingMessage, voiceMode, speak]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  // Toggle voice mode off: stop listening + cancel speech
  function toggleVoiceMode() {
    if (voiceMode) {
      stopListening();
      cancelSpeech();
    }
    setVoiceMode(v => !v);
  }

  function handleSend() {
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="professor-panel">
      <div className="professor-panel-header">
        <div>
          <div className="professor-panel-title">Professor</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            Ask anything about this lesson
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {voiceSupported && (
            <button
              onClick={toggleVoiceMode}
              title={voiceMode ? 'Turn off voice mode' : 'Turn on voice mode'}
              style={{
                background: voiceMode ? 'var(--indigo-soft)' : 'none',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '4px 8px',
                fontSize: '0.7rem',
                color: voiceMode ? 'var(--indigo)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {voiceMode ? '🔊 Voice on' : '🔇 Voice off'}
            </button>
          )}
          <button
            onClick={reportStruggling}
            title="Let your advisor know you're finding this difficult"
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '4px 8px',
              fontSize: '0.7rem', color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            I'm finding this difficult
          </button>
        </div>
      </div>

      <div className="professor-chat-messages">
        {loading && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', marginTop: 24 }}>
            Loading conversation...
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center', padding: '24px 16px', lineHeight: 1.6 }}>
            Hi! I'm here to help you with <strong>{lessonTitle}</strong>.<br />
            Ask me anything — questions, clarifications, examples, whatever you need.
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role}`}>
            <div className="chat-msg-bubble">{msg.content}</div>
          </div>
        ))}

        {streamingMessage && (
          <div className="chat-msg assistant">
            <div className="chat-msg-bubble">
              {streamingMessage}
              <span style={{ opacity: 0.4, animation: 'blink 1s infinite' }}>▌</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="professor-chat-input">
        {voiceMode && voiceSupported && (
          <button
            onMouseDown={startListening}
            onMouseUp={stopListening}
            onTouchStart={startListening}
            onTouchEnd={stopListening}
            title="Hold to speak"
            style={{
              flexShrink: 0,
              width: 36, height: 36,
              borderRadius: '50%',
              border: listening
                ? '2px solid var(--indigo)'
                : '1px solid var(--border)',
              background: listening ? 'var(--indigo-soft)' : 'none',
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.1s',
              animation: listening ? 'pulse 1s ease-in-out infinite' : 'none',
            }}
          >
            🎙️
          </button>
        )}
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={listening ? 'Listening…' : 'Ask the professor...'}
          rows={1}
          disabled={sending}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="btn btn-primary btn-sm"
          style={{ alignSelf: 'flex-end' }}
        >
          {sending ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '→'}
        </button>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 var(--indigo-soft)} 50%{box-shadow:0 0 0 6px transparent} }
      `}</style>
    </div>
  );
}
