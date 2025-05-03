from abc import ABC, abstractmethod
import asyncio
from typing import Union, Generator, AsyncGenerator, Dict, Any, Optional

class BaseAgent(ABC):
    """
    A base class for all agents. Defines common interfaces and behaviors.
    """

    def __init__(self, name: str):
        self.name = name
        self.state = {}

    @abstractmethod
    def reset(self):
        """Reset the agent to its initial state."""
        pass

    @abstractmethod
    def step(self, input_data) -> Any:
        """
        Perform a single step of interaction with the agent.
        Returns the complete response (non-streaming).
        """
        pass

    @abstractmethod
    async def a_step(self, input_data) -> Any:
        """
        Async version of step that returns the complete response.
        """
        pass

    @abstractmethod
    async def stream_step(self, input_data) -> AsyncGenerator[str, None]:
        """
        Stream the agent's response one token/chunk at a time.
        Returns an async generator that yields response fragments.
        """
        pass

    def log(self, message: str):
        """Log a message for debugging or tracking purposes."""
        print(f"[{self.name}] {message}")

    def update_state(self, key: str, value):
        """Update the internal state of the agent."""
        self.state[key] = value

    def get_state(self, key: str):
        """Retrieve a value from the agent's state."""
        return self.state.get(key)