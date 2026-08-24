// Read-only event watcher for local demos.
import * as amqp from 'amqplib';

const EVENTS_EXCHANGE = 'bumpa.events';

const CONNECTION = {
  protocol: 'amqp' as const,
  hostname: process.env.RABBITMQ_HOST ?? 'localhost',
  port: Number(process.env.RABBITMQ_PORT ?? 5672),
  username: process.env.RABBITMQ_USER ?? 'bumpa',
  password: process.env.RABBITMQ_PASSWORD ?? 'bumpa',
};

// Basic ANSI colors for the terminal demo.
const COLOR = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};
const EVENT_COLORS: Record<string, string> = {
  'PurchaseCompleted.v1': '\x1b[36m', // cyan
  'AchievementUnlocked.v1': '\x1b[33m', // yellow
  'BadgeUnlocked.v1': '\x1b[35m', // magenta
  'CashbackProcessed.v1': '\x1b[32m', // green
};

// Display-only list of current consumers.
const KNOWN_CONSUMER_QUEUES: Record<string, string[]> = {
  'PurchaseCompleted.v1': ['loyalty.purchase-completed'],
  'BadgeUnlocked.v1': ['cashback.badge-unlocked'],
  'AchievementUnlocked.v1': [],
  'CashbackProcessed.v1': [],
};

interface DomainEventShape {
  eventId?: string;
  type?: string;
  correlationId?: string;
  occurredAt?: string;
  payload?: unknown;
}

async function main(): Promise<void> {
  const connection = await amqp.connect(CONNECTION);
  const channel = await connection.createChannel();
  await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });

  const { queue } = await channel.assertQueue('', { exclusive: true, autoDelete: true });
  await channel.bindQueue(queue, EVENTS_EXCHANGE, '#');

  console.log(`${COLOR.bold}Watching every event on "${EVENTS_EXCHANGE}"...${COLOR.reset} ${COLOR.dim}(Ctrl+C to stop)${COLOR.reset}\n`);

  await channel.consume(queue, (message) => {
    if (!message) {
      return;
    }
    printEvent(message, queue);
    channel.ack(message);
  });

  const shutdown = async (): Promise<void> => {
    console.log(`\n${COLOR.dim}Stopping...${COLOR.reset}`);
    await channel.close().catch(() => undefined);
    await connection.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function printEvent(message: amqp.ConsumeMessage, queue: string): void {
  let event: DomainEventShape;
  try {
    event = JSON.parse(message.content.toString('utf8')) as DomainEventShape;
  } catch {
    console.log(`${COLOR.dim}(unparseable message on routing key "${message.fields.routingKey}")${COLOR.reset}`);
    return;
  }

  const type = event.type ?? message.fields.routingKey;
  const color = EVENT_COLORS[type] ?? COLOR.bold;
  const time = new Date(event.occurredAt ?? Date.now()).toLocaleTimeString();

  console.log(`${color}${COLOR.bold}● ${type}${COLOR.reset}  ${COLOR.dim}${time}${COLOR.reset}`);
  const consumers = KNOWN_CONSUMER_QUEUES[type];
  const consumedBy = consumers && consumers.length > 0 ? consumers.join(', ') : `${COLOR.dim}(no consumer yet)${COLOR.reset}`;

  console.log(`  ${COLOR.dim}exchange${COLOR.reset}      ${message.fields.exchange}`);
  console.log(`  ${COLOR.dim}routingKey${COLOR.reset}    ${message.fields.routingKey}`);
  console.log(`  ${COLOR.dim}watcherQueue${COLOR.reset}  ${queue}  ${COLOR.dim}(this script's own temporary tap)${COLOR.reset}`);
  console.log(`  ${COLOR.dim}consumedBy${COLOR.reset}    ${consumedBy}`);
  console.log(`  ${COLOR.dim}eventId${COLOR.reset}       ${event.eventId ?? '-'}`);
  console.log(`  ${COLOR.dim}correlationId${COLOR.reset} ${event.correlationId ?? '-'}`);
  console.log(`  ${COLOR.dim}payload${COLOR.reset}`);
  console.log(indent(JSON.stringify(event.payload ?? {}, null, 2), 4));
  console.log();
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => pad + line)
    .join('\n');
}

main().catch((error) => {
  console.error('Failed to start event watcher:', error);
  process.exit(1);
});
