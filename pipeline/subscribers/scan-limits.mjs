export const subscriberScanLimits = Object.freeze({
  defaultMessages: 500,
  hardMaximumMessages: 2000,
});

export function resolveSubscriberScanLimit(args = []) {
  const option = args.find((value) => value.startsWith("--max-messages="));
  if (!option) return subscriberScanLimits.defaultMessages;
  const value = Number(option.slice("--max-messages=".length));
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("--max-messages must be a positive integer");
  }
  if (value > subscriberScanLimits.hardMaximumMessages) {
    throw new Error(
      `--max-messages cannot exceed ${subscriberScanLimits.hardMaximumMessages}`,
    );
  }
  return value;
}
