"""
Scientific search agent for finding and processing research papers
使用 ArxivSearcher 搜索、阅读和下载学术论文
"""
import os
import yaml
from typing import List, Dict, Any, Optional, Union, Generator, AsyncGenerator

from sciagents.agents.chat_agent import ChatAgent
from sciagents.agents.message import AgentInput, Message, Role, AgentOutput
from sciagents.tools import function_tool

from gscientist.agents.base_agent import BaseAgent
from gscientist.tools.builtins.paper_search.arxiv import ArxivSearcher


class SciSearchAgent(ChatAgent, BaseAgent):
    """Agent for searching scientific papers and extracting information from them"""
    
    def __init__(self, name='SciSearchAgent', llm_config=None, tools=None):
        """
        Initialize the SciSearchAgent.
        
        Args:
            name: Name of the agent
            llm_config: Configuration for LLM
            tools: Additional tools to equip the agent with
        """
        BaseAgent.__init__(self, name, llm_config)
        
        # Initialize paper search tools
        self.searcher = ArxivSearcher()
        
        # Set up tools list 
        if tools is None:
            tools = []
        
        # Get tools directly from ArxivSearcher
        tools.extend(self.searcher.get_tools())
        
        # Initialize ChatAgent
        ChatAgent.__init__(
            self,
            name=name,
            llm_config=llm_config,
            tools=tools,
        )
        
        # Initialize state
        self.state = {
            "last_search_results": [],
        }
    
    def log(self, message):
        """Simple logging method"""
        print(f"[{self.name}] {message}")
    
    def reset(self):
        """Reset the agent to its initial state"""
        self.log("Resetting SciSearchAgent...")
        self.state.clear()
        self.state = {
            "last_search_results": [],
        }
    
    def step(self, input_data: Union[AgentInput, List[Dict], str], stream: bool = False, *args: Any, **kwargs: Any) -> AgentOutput:
        """
        Perform a single step of the agent's operation.
        
        Args:
            input_data: Input messages as AgentInput or list of dictionaries.
            stream: Whether to enable streaming output, defaults to False.
            *args, **kwargs: Additional arguments for flexibility.
            
        Returns:
            AgentOutput: Contains response content (str or Generator) and optional metadata.
        """
        return ChatAgent.step(self, input_data, stream, *args, **kwargs)
    
    async def a_step(self, input_data: Union[AgentInput, List[Dict], str], stream: bool = False, *args: Any, **kwargs: Any) -> AgentOutput:
        """
        Perform a single step of the agent's operation asynchronously.
        
        Args:
            input_data: Input messages as AgentInput or list of dictionaries.
            stream: Whether to enable streaming output, defaults to False.
            *args, **kwargs: Additional arguments for flexibility.
            
        Returns:
            AgentOutput: Contains response content (str or AsyncGenerator) and optional metadata.
        """
        return await ChatAgent.a_step(self, input_data, stream, *args, **kwargs)


if __name__ == "__main__":
    # Load YAML configuration file
    with open(os.path.join("config", "config.yml"), "r") as f:
        config = yaml.safe_load(f)
    
    llm_config = config['agents'].get('GSAgent')  
    llm_config = {
        "model": llm_config["model"],
        "api_key": llm_config["api_key"],
        "api_base": llm_config["url"],
        **llm_config.get("model_config_dict", {})
    }
    
    # Create the agent
    agent = SciSearchAgent(llm_config=llm_config)
    
    # Test using the agent with step method
    print("Testing SciSearchAgent...")
    
    # Create a test prompt to search for papers
    test_input = "Find 8 recent papers about transformers in natural language processing, and give the details of each paper, especially for the url. and you can also read these papers and give the details of each paper"
    
    # Convert string to AgentInput
    message = Message(role=Role.USER, content=test_input)
    agent_input = AgentInput(messages=[message])
    
    # Use step method to get a response
    response = agent.step(agent_input, stream=True)
    
    # print the streaming response
    if hasattr(response.content, "__iter__") and not isinstance(response.content, str):
        # 是生成器，逐步打印
        for chunk in response.content:
            print(chunk, end="", flush=True)
        print()
    else:
        # 是字符串，直接打印
        print(response.content)