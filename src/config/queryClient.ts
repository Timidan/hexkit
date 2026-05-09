// Split from config/rainbowkit so importers don't transitively load the
// wagmi/RainbowKit module graph on non-EVM routes.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export const queryClient = new QueryClient();
export { QueryClientProvider };
