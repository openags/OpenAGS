from abc import ABC, abstractmethod

class Agent(ABC):
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
    def step(self, input_data):
        """Perform a single step of interaction with the agent."""
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