import { createFileRoute } from "@tanstack/react-router";
import { ElevatorGame } from "@/components/ElevatorGame";

export const Route = createFileRoute("/")({ component: ElevatorGame });
