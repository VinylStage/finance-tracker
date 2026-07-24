import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

const components = {
  h1: (props) => <h1 className="text-xl font-semibold text-slate-800 mt-6 mb-3 first:mt-0" {...props} />,
  h2: (props) => <h2 className="text-lg font-semibold text-slate-800 mt-6 mb-2" {...props} />,
  h3: (props) => <h3 className="text-sm font-semibold text-slate-700 mt-4 mb-2" {...props} />,
  p: (props) => <p className="text-sm text-slate-600 leading-relaxed mb-3" {...props} />,
  ul: (props) => <ul className="list-disc list-inside text-sm text-slate-600 space-y-1 mb-3" {...props} />,
  li: (props) => <li className="text-sm text-slate-600" {...props} />,
  strong: (props) => <strong className="font-semibold text-slate-800" {...props} />,
  code: (props) => <code className="bg-slate-100 text-indigo-700 rounded px-1.5 py-0.5 text-xs" {...props} />,
  a: (props) => <a className="text-indigo-600 hover:text-indigo-700 underline" {...props} />,
};

export default function Guide() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/guide')
      .then(r => {
        if (!r.ok) throw new Error('가이드 문서를 불러오지 못했습니다.');
        return r.text();
      })
      .then(text => setContent(text))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-500 text-center py-20">로딩 중...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">가이드</h1>
      <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-5">
        {error ? (
          <p className="text-sm text-rose-600">{error}</p>
        ) : (
          <ReactMarkdown components={components}>{content}</ReactMarkdown>
        )}
      </div>
    </div>
  );
}
