import { Router, Request, Response } from 'express';

const router = Router();

// MiniMax API proxy - avoids CORS issues from browser
// The MiniMax API doesn't allow certain headers from OpenAI SDK
router.post('/minimax/chat/completions', async (req: Request, res: Response) => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'API key required' });
    return;
  }

  const baseUrl = (req.headers['x-base-url'] as string) || 'https://api.minimax.io/v1';

  try {
    const isStreaming = req.body?.stream === true;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Proxy] MiniMax error:', response.status, errorText);
      res.status(response.status).json({
        error: `MiniMax API error: ${response.status}`,
        details: errorText,
      });
      return;
    }

    if (isStreaming) {
      // Stream the response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = response.body?.getReader();
      if (!reader) {
        res.status(500).json({ error: 'Failed to get response stream' });
        return;
      }

      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } catch (streamError) {
        console.error('[AI Proxy] Stream error:', streamError);
      } finally {
        res.end();
      }
    } else {
      // Non-streaming response
      const data = await response.json();
      res.json(data);
    }
  } catch (error) {
    console.error('[AI Proxy] MiniMax request failed:', error);
    res.status(500).json({
      error: 'Failed to connect to MiniMax API',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Test MiniMax connection
router.get('/minimax/test', async (req: Request, res: Response) => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'API key required' });
    return;
  }

  const baseUrl = (req.headers['x-base-url'] as string) || 'https://api.minimax.io/v1';

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.1',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.json({ success: false, error: `HTTP ${response.status}: ${errorText}` });
      return;
    }

    const data = await response.json();
    res.json({ success: !!data.choices?.[0] });
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    });
  }
});

export { router as aiRouter };
