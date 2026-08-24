// Browser version of watch-events.ts: same live tap on the event bus, streamed to any
// connected browser tab over SSE instead of printed to a terminal.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import type { ServerResponse } from 'node:http';
import * as amqp from 'amqplib';

const EVENTS_EXCHANGE = 'bumpa.events';
const DASHBOARD_PORT = Number(process.env.EVENTS_DASHBOARD_PORT ?? 4100);
const HTML_PATH = join(__dirname, 'events-dashboard.html');

// Display-only list of current consumers — same table as watch-events.ts.
const KNOWN_CONSUMER_QUEUES: Record<string, string[]> = {
  'PurchaseCompleted.v1': ['loyalty.purchase-completed'],
  'BadgeUnlocked.v1': ['cashback.badge-unlocked'],
  'AchievementUnlocked.v1': [],
  'CashbackProcessed.v1': [],
};

const CONNECTION = {
  protocol: 'amqp' as const,
  hostname: process.env.RABBITMQ_HOST ?? 'localhost',
  port: Number(process.env.RABBITMQ_PORT ?? 5672),
  username: process.env.RABBITMQ_USER ?? 'bumpa',
  password: process.env.RABBITMQ_PASSWORD ?? 'bumpa',
};

// One shared RabbitMQ subscription fans out to every connected browser tab — opening five
// tabs doesn't open five queues on the broker.
const clients = new Set<ServerResponse>();

function broadcast(data: string): void {
  const frame = `data: ${data}\n\n`;
  for (const client of clients) {
    client.write(frame);
  }
}

function readConsumedBy(type: string): string {
  const consumers = KNOWN_CONSUMER_QUEUES[type];
  return consumers && consumers.length > 0 ? consumers.join(', ') : '(no consumer yet)';
}

async function connectToEventBus(): Promise<void> {
  const connection = await amqp.connect(CONNECTION);
  const channel = await connection.createChannel();
  await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });

  const { queue: watcherQueue } = await channel.assertQueue('', { exclusive: true, autoDelete: true });
  await channel.bindQueue(watcherQueue, EVENTS_EXCHANGE, '#');

  await channel.consume(watcherQueue, (message) => {
    if (!message) {
      return;
    }

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(message.content.toString('utf8')) as Record<string, unknown>;
    } catch {
      channel.ack(message);
      return;
    }

    const type = typeof event.type === 'string' ? event.type : message.fields.routingKey;
    broadcast(
      JSON.stringify({
        ...event,
        exchange: message.fields.exchange,
        routingKey: message.fields.routingKey,
        watcherQueue,
        consumedBy: readConsumedBy(type),
      }),
    );
    channel.ack(message);
  });

  console.log(`Connected to RabbitMQ at ${CONNECTION.hostname}:${CONNECTION.port}, tapping "${EVENTS_EXCHANGE}"`);
}

function startHttpServer(): void {
  const server = createServer((req, res) => {
    if (req.url === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync(HTML_PATH, 'utf8'));
  });

  server.listen(DASHBOARD_PORT, () => {
    console.log(`Event dashboard: http://localhost:${DASHBOARD_PORT}`);
  });
}

async function main(): Promise<void> {
  startHttpServer();
  await connectToEventBus();
}

main().catch((error) => {
  console.error('Failed to start event dashboard:', error);
  process.exit(1);
});
