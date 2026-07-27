import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../lib/api';

const components = {
  h1: (props) => <h1 className="text-xl font-semibold text-ink mt-6 mb-3 first:mt-0" {...props} />,
  h2: (props) => <h2 className="text-lg font-semibold text-ink mt-6 mb-2" {...props} />,
  h3: (props) => <h3 className="text-sm font-semibold text-ink-body mt-4 mb-2" {...props} />,
  p: (props) => <p className="text-sm text-ink-muted leading-relaxed mb-3" {...props} />,
  ul: (props) => <ul className="list-disc list-inside text-sm text-ink-muted space-y-1 mb-3" {...props} />,
  li: (props) => <li className="text-sm text-ink-muted" {...props} />,
  strong: (props) => <strong className="font-semibold text-ink" {...props} />,
  code: (props) => <code className="bg-surface-sunken text-accent-strong rounded px-1.5 py-0.5 text-xs" {...props} />,
  a: (props) => <a className="text-accent hover:text-accent-strong underline" {...props} />,
};

export default function Guide() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/guide')
      .then(text => setContent(text))
      .catch(() => setError('가이드 문서를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-ink-subtle text-center py-20">로딩 중...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-ink">가이드</h1>
      <div className="bg-surface shadow-card rounded-card border border-line p-5">
        {error ? (
          <p className="text-sm text-expense">{error}</p>
        ) : (
          <ReactMarkdown components={components}>{content}</ReactMarkdown>
        )}
      </div>
    </div>
  );
}
