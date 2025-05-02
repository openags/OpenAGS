class AgentRegistry:
    """
    A registry to manage multiple Agent instances dynamically.
    """

    _agents = {}

    @classmethod
    def register_agent(cls, name: str, agent_instance):
        """Register a new agent instance."""
        cls._agents[name] = agent_instance

    @classmethod
    def get_agent(cls, name: str):
        """Retrieve an agent instance by name."""
        return cls._agents.get(name)

    @classmethod
    def remove_agent(cls, name: str):
        """Remove an agent instance by name."""
        if name in cls._agents:
            del cls._agents[name]

    @classmethod
    def list_agents(cls):
        """List all registered agent names."""
        return list(cls._agents.keys())